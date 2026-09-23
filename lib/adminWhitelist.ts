/**
 * Daftar nama yang boleh MELIHAT dan mencoba masuk ke menu "Admin".
 *
 * Cara pakai:
 * - Tulis nama PERSIS seperti yang tampil di aplikasi (nama profil Discord anggota).
 * - Satu nama per baris, dipisah koma.
 * - Nama tidak peka huruf besar/kecil dan spasi di ujung akan diabaikan saat dicocokkan.
 *
 * Catatan: file ini hanya mengatur siapa yang MELIHAT tombol/menu Admin di navigasi.
 * Untuk benar-benar masuk ke dalamnya, orang tersebut tetap harus tahu PIN Admin
 * (diatur lewat menu "Kelola Akses" di dalam Admin). Jadi ada 2 lapis: nama harus
 * ada di sini, DAN harus tahu PIN. Kalau mau menambah/menghapus siapa yang bisa
 * login (bukan cuma melihat menunya), itu diatur lewat "Kelola Akses" di dalam
 * aplikasi (tabel admin_settings di Supabase), bukan lewat file ini.
 */
export const ADMIN_WHITELIST: string[] = [
  // Contoh — ganti dengan nama anggota yang berwenang:
  // "Ian Syah",
  // "Budi Santoso",
];

/** Cek apakah sebuah nama ada di daftar whitelist (tanpa peduli besar/kecil huruf & spasi). */
export function isOnAdminWhitelist(name: string | null | undefined): boolean {
  if (!name) return false;
  const n = name.trim().toLowerCase();
  if (!n) return false;
  return ADMIN_WHITELIST.some((w) => w.trim().toLowerCase() === n);
}
