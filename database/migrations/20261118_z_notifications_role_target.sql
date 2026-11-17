-- Notifikasi per peran (recipient_role terisi) dulu tersimpan dengan recipient_username = '*'
-- sehingga terbaca sebagai siaran dan ikut muncul untuk semua user (termasuk kasir).
-- Samakan dengan format baru: username kosong = hanya untuk peran tujuan.
-- (Query baca juga sudah mengabaikan '*' bila recipient_role terisi.)
UPDATE notifications
   SET recipient_username = ''
 WHERE recipient_username = '*'
   AND recipient_role IS NOT NULL;
