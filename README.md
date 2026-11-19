# Inventaris Tonasa

Aplikasi portofolio untuk pencatatan aset, persetujuan perubahan, dan pelaporan audit. Dibangun dengan **Next.js**, **Express**, dan **PostgreSQL**.

[**Buka demo online**](https://inventaris-tonasa-irfan.muhghaza439.chatgpt.site)

Pilih **Coba Demo** untuk masuk sebagai Admin Demo. Demo berisi data fiktif dan menyimpan perubahan di browser pengunjung. Gunakan data contoh saat mencoba impor, unggah foto, atau pengelolaan pengguna.

## Fitur

- Dasbor ringkasan kondisi aset dan persetujuan yang tertunda.
- Inventaris dengan pencarian, filter, foto, serta impor Excel dan ekspor Excel/PDF.
- Persetujuan aset, riwayat perubahan, dan pemulihan data.
- Pengelolaan pengguna dengan peran Admin Utama, Admin, dan User.

## Jalankan aplikasi dengan PostgreSQL

Butuh Node.js 22 atau 24 dan database PostgreSQL.

```bash
npm ci
cp .env.example .env.local
```

Isi `DATABASE_URL`, `SECRET_KEY`, `ADMIN_EMAIL`, dan `ADMIN_PASSWORD` di `.env.local`. Kata sandi admin awal minimal 12 karakter. Aplikasi menyiapkan tabel dan akun admin saat permintaan API pertama ke database kosong. Untuk menambahkan aset fiktif secara opsional, jalankan `npm run seed:demo`. Jalankan `npm run dev` dan buka `http://localhost:3001`.

## Deploy versi dengan database cloud

1. Siapkan database PostgreSQL baru pada penyedia hosting.
2. Hubungkan repositori ini sebagai layanan web Node.js. Isi perintah build dengan `npm ci && npm run build` dan perintah start dengan `npm start`. Next.js membaca variabel `PORT` yang disediakan oleh hosting.
3. Masukkan `DATABASE_URL`, `SECRET_KEY`, `ADMIN_EMAIL`, dan `ADMIN_PASSWORD` melalui pengaturan environment hosting. Gunakan URL koneksi yang disediakan penyedia database. Simpan kunci dan kata sandi sebagai secret.
4. Deploy, buka URL layanan, lalu masuk dengan akun admin awal. Foto baru disimpan di PostgreSQL sehingga tetap tersedia setelah proses aplikasi dimulai ulang.

`ALLOW_PUBLIC_REGISTRATION=true` mengaktifkan pendaftaran pengguna mandiri. Nilai bawaan menonaktifkannya.

Untuk membangun demo browser secara terpisah, jalankan `npm run build:demo`. Hasilnya ada di `out/`.
