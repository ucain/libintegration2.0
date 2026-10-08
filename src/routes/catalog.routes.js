const express = require('express');
const { pool, withTransaction } = require('../config/db');
const { authenticate, requireRoles } = require('../middleware/auth');
const { AppError, ok, asyncHandler } = require('../utils/http');
const { writeAudit } = require('../utils/audit');

const router = express.Router();
router.use(authenticate);

router.get('/books', asyncHandler(async (req, res) => {
  const q = String(req.query.q || '').trim();
  const available = req.query.available === 'true';
  const params = [];
  let where = 'WHERE 1=1';
  if (q) {
    params.push(`%${q}%`);
    where += ` AND (b.title ILIKE $${params.length} OR b.author ILIKE $${params.length} OR b.isbn ILIKE $${params.length})`;
  }
  if (available) where += ` AND EXISTS (SELECT 1 FROM book_copy c2 WHERE c2.book_id=b.book_id AND c2.status='AVAILABLE')`;

  const { rows } = await pool.query(
    `SELECT b.*,
            COUNT(c.copy_id)::int AS total_copies,
            COUNT(c.copy_id) FILTER (WHERE c.status='AVAILABLE')::int AS available_copies
       FROM book_title b
       LEFT JOIN book_copy c ON c.book_id=b.book_id
       ${where}
      GROUP BY b.book_id
      ORDER BY b.title
      LIMIT 200`,
    params
  );
  ok(res, rows);
}));

router.get('/books/:bookId', asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT b.*,
            COALESCE(json_agg(json_build_object('copyId',c.copy_id,'barcode',c.barcode,'location',c.location,'condition',c.condition,'status',c.status)
              ORDER BY c.barcode) FILTER (WHERE c.copy_id IS NOT NULL), '[]') AS copies
       FROM book_title b LEFT JOIN book_copy c ON c.book_id=b.book_id
      WHERE b.book_id=$1 GROUP BY b.book_id`,
    [req.params.bookId]
  );
  if (!rows[0]) throw new AppError(404, 'BOOK_NOT_FOUND', 'Judul buku tidak ditemukan.');
  ok(res, rows[0]);
}));

router.get('/copies/:copyId', asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT c.*,b.title,b.author,b.isbn FROM book_copy c JOIN book_title b ON b.book_id=c.book_id WHERE c.copy_id=$1`,
    [req.params.copyId]
  );
  if (!rows[0]) throw new AppError(404, 'COPY_NOT_FOUND', 'Eksemplar tidak ditemukan.');
  ok(res, rows[0]);
}));

router.post('/admin/books', requireRoles('LIBRARY_ADMIN'), asyncHandler(async (req, res) => {
  const { isbn, title, author, edition, publisher, publicationYear, category } = req.body || {};
  if (!title) throw new AppError(400, 'TITLE_REQUIRED', 'Judul buku wajib diisi.');
  const { rows } = await pool.query(
    `INSERT INTO book_title(isbn,title,author,edition,publisher,publication_year,category)
     VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [isbn || null, title, author || null, edition || null, publisher || null, publicationYear || null, category || null]
  );
  await writeAudit(pool, { actorId:req.user.sub, action:'BOOK_TITLE_CREATED', objectType:'BOOK_TITLE', objectId:rows[0].book_id, newValue:rows[0] });
  ok(res, rows[0], 'Judul buku berhasil ditambahkan.', 201);
}));

router.post('/admin/books/:bookId/copies', requireRoles('LIBRARY_ADMIN'), asyncHandler(async (req, res) => {
  const { barcode, location, condition='GOOD' } = req.body || {};
  if (!barcode) throw new AppError(400, 'BARCODE_REQUIRED', 'Barcode wajib diisi.');
  const { rows } = await pool.query(
    `INSERT INTO book_copy(book_id,barcode,location,condition,status) VALUES($1,$2,$3,$4,'AVAILABLE') RETURNING *`,
    [req.params.bookId, barcode, location || null, condition]
  );
  await writeAudit(pool, { actorId:req.user.sub, action:'BOOK_COPY_CREATED', objectType:'BOOK_COPY', objectId:rows[0].copy_id, newValue:rows[0] });
  ok(res, rows[0], 'Eksemplar berhasil ditambahkan.', 201);
}));

router.patch('/admin/copies/:copyId', requireRoles('LIBRARY_ADMIN'), asyncHandler(async (req, res) => {
  const allowed = ['AVAILABLE','RESERVED','BORROWED','LOST','DAMAGED','MAINTENANCE'];
  const { status, condition, location } = req.body || {};
  if (status && !allowed.includes(status)) throw new AppError(422, 'INVALID_COPY_STATUS', 'Status copy tidak valid.');
  const result = await withTransaction(async (db) => {
    const before = await db.query('SELECT * FROM book_copy WHERE copy_id=$1 FOR UPDATE',[req.params.copyId]);
    if (!before.rows[0]) throw new AppError(404,'COPY_NOT_FOUND','Eksemplar tidak ditemukan.');
    const updated = await db.query(
      `UPDATE book_copy SET status=COALESCE($2,status),condition=COALESCE($3,condition),location=COALESCE($4,location),updated_at=now()
        WHERE copy_id=$1 RETURNING *`,
      [req.params.copyId,status||null,condition||null,location||null]
    );
    await writeAudit(db,{actorId:req.user.sub,action:'BOOK_COPY_UPDATED',objectType:'BOOK_COPY',objectId:req.params.copyId,oldValue:before.rows[0],newValue:updated.rows[0]});
    return updated.rows[0];
  });
  ok(res,result,'Eksemplar berhasil diperbarui.');
}));

module.exports = router;
