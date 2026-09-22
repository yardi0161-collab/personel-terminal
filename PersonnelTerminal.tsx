"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { fetchDiscordGuildRoles, fetchDiscordProfile, mapRolesToPangkatDivisi } from "@/lib/discord";

/* ------------------------------------------------------------------ */
/* Data — default/fallback (dipakai kalau belum login Discord)         */
/* ------------------------------------------------------------------ */
export type PersonnelData = {
  name: string;
  rank: string;
  badge: string;
  unit: string;
  avatarUrl: string;
  attendedWeekdays: number[];
  discordLinked: boolean;
};

const DEFAULT_PERSONNEL: PersonnelData = {
  name: "Ian Syah",
  rank: "ABRIGPOL",
  badge: "08111",
  unit: "SABHARA",
  avatarUrl: "", // isi URL foto profil; kosong = tampil inisial
  // Hari yang sudah absen minggu ini (0 = Senin ... 6 = Minggu). Ganti dengan data asli.
  attendedWeekdays: [0, 1, 3],
  discordLinked: false,
};

// eslint-disable-next-line prefer-const
let personnel: PersonnelData = { ...DEFAULT_PERSONNEL };

/** Mengisi data personil (nama, pangkat, devisi, foto) dari sesi Discord. */
function setPersonnelData(data?: Partial<PersonnelData>) {
  if (!data) return;
  personnel = { ...personnel, ...data };
}

/** Kembali ke data default (dipakai saat logout Discord). */
function resetPersonnelData() {
  personnel = { ...DEFAULT_PERSONNEL };
}

/* ------------------------------------------------------------------ */
/* Cache profil Discord                                                */
/* Supabase hanya memberi provider_token (token Discord) sesaat setelah */
/* login. Setelah refresh halaman token itu hilang, jadi nama/pangkat/ */
/* devisi hasil login disimpan di sini supaya tidak kembali ke default. */
/* ------------------------------------------------------------------ */
type DiscordProfileCache = {
  userId: string;
  name: string;
  avatarUrl: string;
  rank: string;
  unit: string;
  refreshToken?: string; // dipakai untuk menyegarkan data dari Discord tanpa login ulang
};
const DISCORD_PROFILE_KEY = "pt-discord-profile-v1";

function loadDiscordProfile(userId: string): DiscordProfileCache | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(DISCORD_PROFILE_KEY) ?? "null");
    if (parsed && parsed.userId === userId && typeof parsed.name === "string") return parsed;
    return null;
  } catch {
    return null;
  }
}
function saveDiscordProfile(profile: DiscordProfileCache) {
  try {
    window.localStorage.setItem(DISCORD_PROFILE_KEY, JSON.stringify(profile));
  } catch {
    /* penyimpanan penuh / dinonaktifkan */
  }
}
function clearDiscordProfile() {
  try {
    window.localStorage.removeItem(DISCORD_PROFILE_KEY);
  } catch {
    /* abaikan */
  }
}

/**
 * Kunci sederhana lintas-tab: sebelum menghubungi Discord untuk menyegarkan data,
 * tiap tab mengecek dulu apakah tab LAIN baru saja mencoba (lewat localStorage,
 * yang dibagikan semua tab di origin yang sama). Kalau iya, tab ini mengalah dan
 * tidak ikut mencoba - mencegah dua tab memakai kunci sekali-pakai yang sama.
 */
const DISCORD_REFRESH_LOCK_KEY = "pt-discord-refresh-lock-v1";
const REFRESH_LOCK_WINDOW_MS = 8000;

function tryAcquireRefreshLock(): boolean {
  try {
    const now = Date.now();
    const last = Number(window.localStorage.getItem(DISCORD_REFRESH_LOCK_KEY) ?? "0");
    if (now - last < REFRESH_LOCK_WINDOW_MS) return false; // tab lain baru saja mencoba
    window.localStorage.setItem(DISCORD_REFRESH_LOCK_KEY, String(now));
    return true;
  } catch {
    return true; // localStorage tidak tersedia -> jangan sampai memblokir
  }
}

/* ------------------------------------------------------------------ */
/* Ikon (inline SVG, tanpa dependency tambahan)                        */
/* ------------------------------------------------------------------ */
type IconProps = { size?: number; stroke?: number; className?: string };

const Svg = ({
  size = 24,
  stroke = 2,
  className,
  children,
}: IconProps & { children: ReactNode }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={stroke}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    {children}
  </svg>
);

const HomeIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
  </Svg>
);
const HistoryIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 3v5h5" />
    <path d="M12 7v5l3 2" />
  </Svg>
);
const ClipboardCheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="8" y="2" width="8" height="4" rx="1" />
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <path d="m9 14 2 2 4-4" />
  </Svg>
);
const ClockIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Svg>
);
const ClipboardListIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="8" y="2" width="8" height="4" rx="1" />
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <path d="M12 11h4M12 16h4M8 11h.01M8 16h.01" />
  </Svg>
);
const CalendarCheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
    <path d="m9 16 2 2 4-4" />
  </Svg>
);

const CameraIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
    <circle cx="12" cy="13.5" r="3.5" />
  </Svg>
);
const XIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);
const CheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m5 12.5 4.5 4.5L19 7" />
  </Svg>
);
const MenuDotsIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Svg>
);
const LogOutIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="m16 17 5-5-5-5" />
    <path d="M21 12H9" />
  </Svg>
);
const ArrowLeftIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m12 19-7-7 7-7" />
    <path d="M19 12H5" />
  </Svg>
);
const ShieldCheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
    <path d="m9 12 2 2 4-4" />
  </Svg>
);
const ShieldAlertIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
    <path d="M12 8v4" />
    <path d="M12 16h.01" />
  </Svg>
);
const SearchIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </Svg>
);
const TicketIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
    <path d="M13 5v2M13 11v2M13 17v2" />
  </Svg>
);
const TruckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
    <path d="M15 18H9" />
    <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14" />
    <circle cx="17" cy="18" r="2" />
    <circle cx="7" cy="18" r="2" />
  </Svg>
);
const FileTextIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
    <path d="M14 3v5h5" />
    <path d="M9 13h6M9 17h6M9 9h1" />
  </Svg>
);
/* Dekorasi besar di background kartu */
const ChevronDownIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m6 9 6 6 6-6" />
  </Svg>
);
const CalendarDeco = () => (
  <svg viewBox="0 0 200 200" fill="none" stroke="currentColor" strokeWidth={13} strokeLinecap="round" aria-hidden="true">
    <rect x="22" y="38" width="156" height="142" rx="30" />
    <path d="M22 86h156M68 16v34M132 16v34" />
    <path d="M62 122h.01M100 122h.01M138 122h.01M62 154h.01M100 154h.01" strokeWidth={16} />
  </svg>
);

/* ------------------------------------------------------------------ */
/* Komponen                                                            */
/* ------------------------------------------------------------------ */
type Tab = "home" | "log" | "admin";
type Screen =
  | Tab
  | "absensi"
  | "absensi-form"
  | "cuti"
  | "laporan"
  | "evidence"
  | "cell"
  | "tilang"
  | "impound";

const tabs: { id: Tab; label: string; Icon: (p: IconProps) => JSX.Element }[] = [
  { id: "home", label: "Home", Icon: HomeIcon },
  { id: "log", label: "Log", Icon: HistoryIcon },
  { id: "admin", label: "Admin", Icon: ShieldCheckIcon },
];

const screenTitle: Record<Screen, string> = {
  home: "DUTY & LAPORAN",
  log: "Log",
  admin: "Admin",
  absensi: "Absensi",
  "absensi-form": "Form Absensi",
  cuti: "Izin Cuti",
  laporan: "Laporan",
  evidence: "Evidence",
  cell: "Cell Management",
  tilang: "Tilang Kendaraan",
  impound: "Impound Kendaraan",
};

/** Layar induk (parent) untuk tombol kembali pada layar turunan. */
const parentScreen = (s: Screen): Screen => {
  if (s === "evidence" || s === "cell" || s === "tilang" || s === "impound") return "laporan";
  if (s === "absensi-form" || s === "cuti") return "absensi";
  return "home";
};

const ChevronLeft = (p: IconProps) => (
  <Svg {...p}>
    <path d="m15 18-6-6 6-6" />
  </Svg>
);

const DAY_SHORT = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
const DAY_LONG = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];
const MONTH_LONG = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

type DayStatus = "hadir" | "absen" | "belum" | "nanti";

/** Tanggal Senin–Minggu untuk minggu berjalan, lengkap dengan status absennya. */
function getWeek(attended: number[], now = new Date()) {
  const todayIdx = (now.getDay() + 6) % 7; // Senin = 0
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - todayIdx);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    const status: DayStatus =
      i > todayIdx ? "nanti" : attended.includes(i) ? "hadir" : i === todayIdx ? "belum" : "absen";
    return {
      key: `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`,
      date: d.getDate(),
      month: d.getMonth(),
      year: d.getFullYear(),
      short: DAY_SHORT[i],
      today: i === todayIdx,
      status,
      label: `${DAY_LONG[i]}, ${d.getDate()} ${MONTH_LONG[d.getMonth()]}`,
    };
  });
}
/**
 * Foto profil dengan fallback otomatis: kalau URL foto gagal dimuat (link rusak,
 * diblokir, foto sudah dihapus, dsb), otomatis diganti inisial nama, bukan ikon
 * "gambar rusak" bawaan browser.
 */
function Avatar({ url, name }: { url: string; name: string }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) return <>{initials(name)}</>;
  return <img src={url} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
}

const initials = (name: string) =>
  name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

/** Angka naik dari 0 ke target (dilewati jika pengguna memilih reduced motion). */
function useCountUp(target: number, duration = 1000) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setValue(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setValue(target * (1 - Math.pow(1 - t, 3))); // easeOutCubic
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

/** Urutan kemunculan kartu: makin besar i, makin lambat muncul. */
const rise = (i: number): CSSProperties => ({ "--i": i } as CSSProperties);

function HomeScreen({
  onNavigate,
  stagger,
  onDiscordLogin,
  onDiscordLogout,
}: {
  onNavigate: (s: Screen) => void;
  stagger: boolean;
  onDiscordLogin: () => void;
  onDiscordLogout: () => void;
}) {
  const p = personnel;
  const r = (base: string, i: number) => ({
    className: stagger ? `${base} pt-rise` : base,
    style: stagger ? rise(i) : undefined,
  });
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const week = getWeek(p.attendedWeekdays);
  const first = week[0];
  const last = week[6];
  const rangeText =
    first.month === last.month
      ? `${first.date} – ${last.date} ${MONTH_SHORT[last.month]}`
      : `${first.date} ${MONTH_SHORT[first.month]} – ${last.date} ${MONTH_SHORT[last.month]}`;
  const hadir = week.filter((d) => d.status === "hadir").length;
  const hadirShown = Math.round(useCountUp(hadir));

  return (
    <div className="pt-stack">
      {/* Profil: foto, nama, pangkat, devisi */}
      <section {...r("pt-card pt-profile", 0)}>
        <div className="pt-avatar" aria-label={`Foto profil ${p.name}`}>
          <Avatar url={p.avatarUrl} name={p.name} />
        </div>
        <div className="pt-pf">
          <span>Nama</span>
          <strong>{p.name}</strong>
          <em>Badge #{p.badge}</em>
        </div>
        <div className="pt-pf">
          <span>Pangkat</span>
          <strong>{p.rank}</strong>
        </div>
        <div className="pt-pf">
          <span>Devisi</span>
          <strong>{p.unit}</strong>
        </div>
        <button
          type="button"
          onClick={p.discordLinked ? onDiscordLogout : onDiscordLogin}
          className="pt-discord-link"
        >
          {p.discordLinked ? "Logout Discord" : "Hubungkan akun Discord"}
        </button>
      </section>

      {/* Statistik */}
      <div className="pt-grid">
        <button type="button" {...r("pt-card pt-stat pt-link", 1)} onClick={() => onNavigate("absensi")}>
          <div className="pt-deco pt-deco-stat">
            <ClipboardCheckIcon size={84} stroke={1.6} />
          </div>
          <div className="pt-icon-circle pt-icon-blue">
            <ClipboardCheckIcon size={22} />
          </div>
          <p className="pt-stat-title">Absensi</p>
        </button>

        <button type="button" {...r("pt-card pt-stat pt-link", 2)} onClick={() => onNavigate("laporan")}>
          <div className="pt-deco pt-deco-stat">
            <ClipboardListIcon size={84} stroke={1.6} />
          </div>
          <div className="pt-icon-circle pt-icon-green">
            <ClockIcon size={22} />
          </div>
          <p className="pt-stat-title">Laporan</p>
        </button>
      </div>

      {/* Absen minggu ini */}
      <section {...r("pt-card pt-week", 3)}>
        <div className="pt-deco pt-deco-week">
          <CalendarDeco />
        </div>
        <p className="pt-muted">Absen Minggu Ini</p>
        <h2 className="pt-rank pt-week-range">
          {rangeText}
          <span className="pt-unit">{last.year}</span>
        </h2>

        <ol className="pt-days">
          {week.map((d) => (
            <li
              key={d.key}
              className={`pt-day is-${d.status}${d.today ? " is-today" : ""}`}
              aria-label={`${d.label}${d.today ? " (hari ini)" : ""}: ${
                d.status === "hadir"
                  ? "hadir"
                  : d.status === "absen"
                  ? "tidak absen"
                  : d.status === "belum"
                  ? "belum absen"
                  : "belum tiba"
              }`}
            >
              <span className="pt-day-name">{d.short}</span>
              <strong className="pt-day-num">{d.date}</strong>
              <i className="pt-day-dot" />
            </li>
          ))}
        </ol>

        <div className="pt-progress-block">
          <div className="pt-progress-head">
            <span>
              <CalendarCheckIcon size={22} className="pt-blue" />
              Kehadiran
            </span>
            <strong className="pt-blue">{hadirShown}/7 hari</strong>
          </div>
          <div
            className="pt-bar"
            role="progressbar"
            aria-valuenow={hadir}
            aria-valuemin={0}
            aria-valuemax={7}
            aria-label="Kehadiran minggu ini"
          >
            <div className="pt-bar-fill" style={{ width: `${ready ? (hadir / 7) * 100 : 0}%` }} />
          </div>
          <div className="pt-progress-foot">
            <span className="pt-legend">
              <i className="pt-dot is-hadir" />
              Hadir
            </span>
            <span className="pt-legend">
              <i className="pt-dot is-absen" />
              Tidak absen
            </span>
            <span className="pt-legend">
              <i className="pt-dot is-today" />
              Hari ini
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}

/** Menu halaman Laporan. `poin` = angka di lencana kartu (ubah sesuai kebutuhan). */
const LAPORAN_MENU: {
  id: Screen;
  title: string;
  poin: number;
  Icon: (p: IconProps) => JSX.Element;
}[] = [
  { id: "evidence", title: "Evidence", poin: 4, Icon: SearchIcon },
  { id: "cell", title: "Cell Management", poin: 3, Icon: ShieldAlertIcon },
  { id: "tilang", title: "Tilang Kendaraan", poin: 2, Icon: TicketIcon },
  { id: "impound", title: "Impound Kendaraan", poin: 2, Icon: TruckIcon },
];

function LaporanScreen({ onNavigate }: { onNavigate: (s: Screen) => void }) {
  return (
    <div className="pt-ops-grid">
      {LAPORAN_MENU.map(({ id, title, poin, Icon }) => (
        <button key={id} type="button" className="pt-ops-card" onClick={() => onNavigate(id)}>
          <span className="pt-ops-ico">
            <Icon size={22} />
          </span>
          <span className="pt-ops-name">{title}</span>
          <span className="pt-ops-pill">+{poin} Poin</span>
        </button>
      ))}
    </div>
  );
}

/** Menu halaman Absensi: pilih antara isi laporan Absensi atau ajukan Izin Cuti. */
const ABSENSI_MENU: {
  id: Screen;
  title: string;
  desc: string;
  Icon: (p: IconProps) => JSX.Element;
}[] = [
  { id: "absensi-form", title: "Absensi", desc: "Report duty harian", Icon: ClipboardCheckIcon },
  { id: "cuti", title: "Izin Cuti", desc: "Ajukan cuti / izin", Icon: FileTextIcon },
];

function AbsensiMenuScreen({ onNavigate }: { onNavigate: (s: Screen) => void }) {
  return (
    <div className="pt-ops-grid">
      {ABSENSI_MENU.map(({ id, title, desc, Icon }) => (
        <button key={id} type="button" className="pt-ops-card" onClick={() => onNavigate(id)}>
          <span className="pt-ops-ico">
            <Icon size={22} />
          </span>
          <span className="pt-ops-name">{title}</span>
          <span className="pt-photo-hint">{desc}</span>
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Komponen form bersama (dipakai Absensi, Evidence, Cell Management)  */
/* ------------------------------------------------------------------ */
type Pic = { file: File; url: string };

/** Susun teks laporan dengan titik dua yang sejajar. Nilai multi-baris dimulai di baris berikutnya. */
function formatReport(title: string, rows: [label: string, value: string][]) {
  const w = Math.max(...rows.map(([label]) => label.length));
  return [
    title,
    ...rows.map(([label, value]) =>
      value.includes("\n") ? `${label.padEnd(w)} :\n${value}` : `${label.padEnd(w)} : ${value}`
    ),
  ].join("\n");
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="pt-field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

function SubmitBar({
  label,
  valid,
  hint,
  onSubmit,
}: {
  label: string;
  valid: boolean;
  hint: string;
  onSubmit: () => void;
}) {
  return (
    <>
      <button type="button" className="pt-submit" disabled={!valid} onClick={onSubmit}>
        {label}
      </button>
      {!valid && <p className="pt-hint">{hint}</p>}
    </>
  );
}

/** Layar hasil: teks laporan siap salin + pratinjau foto + tombol ubah / buat baru. */
function ReportResult({
  heading,
  hint,
  report,
  images,
  copyLabel,
  editLabel,
  newLabel,
  onEdit,
  onNew,
}: {
  heading: string;
  hint: string;
  report: string;
  images: { url: string; alt: string }[];
  copyLabel: string;
  editLabel: string;
  newLabel: string;
  onEdit: () => void;
  onNew: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard tidak tersedia — pengguna bisa menyalin manual dari kotak teks */
    }
  };
  return (
    <div className="pt-stack">
      <section className="pt-card pt-form-card">
        <div className="pt-done-icon">
          <CheckIcon size={30} stroke={2.6} />
        </div>
        <h2 className="pt-form-title">{heading}</h2>
        <p className="pt-muted" style={{ marginTop: 8 }}>
          {hint}
        </p>
        <pre className="pt-report">{report}</pre>
        {images.length > 0 && (
          <div className="pt-thumbs">
            {images.map((im) => (
              <img key={im.url} src={im.url} alt={im.alt} />
            ))}
          </div>
        )}
      </section>

      <button type="button" className="pt-submit" onClick={copy}>
        {copied ? "Tersalin ✓" : copyLabel}
      </button>
      <button type="button" className="pt-secondary" onClick={onEdit}>
        {editLabel}
      </button>
      <button type="button" className="pt-secondary" onClick={onNew}>
        {newLabel}
      </button>
    </div>
  );
}

/** Pemilih banyak foto (grid 3 kolom) dengan pratinjau dan tombol hapus. */
function PhotoPicker({
  photos,
  max,
  label,
  onChange,
}: {
  photos: Pic[];
  max: number;
  label: string;
  onChange: (next: Pic[]) => void;
}) {
  const add = (files: FileList | null) => {
    if (!files) return;
    const room = Math.max(0, max - photos.length);
    const added: Pic[] = Array.from(files)
      .slice(0, room)
      .map((file) => ({ file, url: URL.createObjectURL(file) }));
    if (added.length) onChange([...photos, ...added]);
  };
  const remove = (i: number) => {
    URL.revokeObjectURL(photos[i].url);
    onChange(photos.filter((_, idx) => idx !== i));
  };

  return (
    <div className="pt-ev-photos">
      {photos.map((ph, i) => (
        <div key={ph.url} className="pt-photo is-filled">
          <img src={ph.url} alt={`${label} ${i + 1}`} />
          <button
            type="button"
            className="pt-photo-x"
            aria-label={`Hapus ${label.toLowerCase()} ${i + 1}`}
            onClick={() => remove(i)}
          >
            <XIcon size={18} />
          </button>
        </div>
      ))}
      {photos.length < max && (
        <div className="pt-photo">
          <label className="pt-photo-empty">
            <input
              type="file"
              accept="image/*"
              multiple
              aria-label={`Tambah ${label.toLowerCase()}`}
              onChange={(e) => {
                add(e.target.files);
                e.target.value = "";
              }}
            />
            <CameraIcon size={28} />
            <span>Tambah</span>
          </label>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Log (riwayat laporan & absensi) — disimpan di localStorage          */
/* ------------------------------------------------------------------ */
type LogKind = "absensi" | "cuti" | "evidence" | "cell" | "tilang" | "impound";
type LogStatus = "pending" | "approved" | "rejected";
type LogEntry = {
  id: number;
  kind: LogKind;
  title: string;
  subtitle: string;
  savedAt: number; // ms sejak epoch
  report: string; // teks laporan lengkap (foto tidak disimpan)
  status: LogStatus; // status persetujuan Admin
  decidedBy?: string; // nama admin yang menyetujui/menolak
  decidedAt?: number; // ms sejak epoch saat diputuskan
};

const LOG_STORAGE_KEY = "pt-logs-v1";
const MAX_LOGS = 200;

function loadLogs(): LogEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LOG_STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    // Log lama (sebelum fitur Admin) belum punya status — anggap "pending".
    return parsed.map((l: LogEntry) => ({ ...l, status: l.status ?? "pending" }));
  } catch {
    return [];
  }
}
function saveLogs(logs: LogEntry[]) {
  try {
    window.localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(logs));
  } catch {
    /* penyimpanan penuh / dinonaktifkan — log tetap ada selama halaman terbuka */
  }
}

const formatSavedAt = (ms: number) => {
  const d = new Date(ms);
  return `${d.getDate()} ${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()} · ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

/* ------------------------------------------------------------------ */
/* Halaman Absensi — form REPORT DUTY SAPD                             */
/* ------------------------------------------------------------------ */
/** Identitas petugas di atas form: foto profil + nama, pangkat, devisi dari akun Discord. */
function IdentityBlock() {
  return (
    <div className="pt-idcard">
      <div className="pt-avatar" aria-label={`Foto profil ${personnel.name}`}>
        <Avatar url={personnel.avatarUrl} name={personnel.name} />
      </div>
      <div className="pt-id3">
        <div>
          <span>Nama</span>
          <strong>{personnel.name}</strong>
        </div>
        <div>
          <span>Pangkat</span>
          <strong>{personnel.rank}</strong>
        </div>
        <div>
          <span>Devisi</span>
          <strong>{personnel.unit}</strong>
        </div>
      </div>
    </div>
  );
}

type Photo = { file: File; url: string } | null;
type Draft = {
  name: string;
  date: string; // YYYY-MM-DD
  start: string; // HH:MM
  end: string; // HH:MM
  activity: string;
  photos: Photo[]; // 4 foto bukti
  submitted: boolean;
  logId: number | null; // id entri di halaman Log (supaya kirim ulang tidak menggandakan)
};

const PHOTO_SLOTS = [
  { title: "Awal Duty", hint: "Buka HP di locker" },
  { title: "Kegiatan 1", hint: "Foto saat aktivitas" },
  { title: "Kegiatan 2", hint: "Foto saat aktivitas" },
  { title: "Akhir Duty", hint: "Buka HP di locker" },
];

const pad2 = (n: number) => String(n).padStart(2, "0");
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
const emptyDraft = (): Draft => ({
  name: personnel.name,
  date: todayISO(),
  start: "",
  end: "",
  activity: "",
  photos: [null, null, null, null],
  submitted: false,
  logId: null,
});

/** "2026-09-20" -> "Minggu, 20 September 2026" */
function formatDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return "";
  const dt = new Date(y, m - 1, d);
  return `${DAY_LONG[(dt.getDay() + 6) % 7]}, ${d} ${MONTH_LONG[m - 1]} ${y}`;
}

/** Selisih menit awal -> akhir. Jika akhir lebih kecil dari awal, dianggap lewat tengah malam. */
function durationMinutes(start: string, end: string): number | null {
  if (!start || !end) return null;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let diff = eh * 60 + em - (sh * 60 + sm);
  if (diff < 0) diff += 24 * 60;
  return diff === 0 ? null : diff;
}
const formatDuration = (min: number) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return [h ? `${h} jam` : "", m ? `${m} menit` : ""].filter(Boolean).join(" ");
};

function buildReport(d: Draft, duration: string) {
  return formatReport("REPORT DUTY SAPD", [
    ["Nama Petugas", d.name.trim()],
    ["Pangkat", personnel.rank],
    ["Devisi", personnel.unit],
    ["Tanggal", formatDate(d.date)],
    ["Time Duty", d.start],
    ["Time Akhir", d.end],
    ["Total Durasi", duration],
    ["Activity", d.activity.trim()],
    ["Bukti Foto", "4 foto (locker awal duty, 2 kegiatan, locker akhir duty)"],
  ]);
}

function AbsensiForm({
  draft,
  setDraft,
  onLog,
}: {
  draft: Draft;
  setDraft: Dispatch<SetStateAction<Draft>>;
  onLog: (entry: LogEntry) => void;
}) {
  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));

  const setPhoto = (i: number, file: File | null) => {
    const old = draft.photos[i];
    if (old) URL.revokeObjectURL(old.url);
    const next: Photo = file ? { file, url: URL.createObjectURL(file) } : null;
    setDraft((d) => ({ ...d, photos: d.photos.map((ph, idx) => (idx === i ? next : ph)) }));
  };

  const minutes = durationMinutes(draft.start, draft.end);
  const overnight = !!draft.start && !!draft.end && draft.end < draft.start;
  const photoCount = draft.photos.filter(Boolean).length;
  const valid =
    draft.name.trim() !== "" &&
    draft.date !== "" &&
    minutes !== null &&
    draft.activity.trim() !== "" &&
    photoCount === 4;

  const reset = () => {
    draft.photos.forEach((ph) => ph && URL.revokeObjectURL(ph.url));
    setDraft(emptyDraft());
  };

  const submit = () => {
    const id = draft.logId ?? Date.now();
    const dur = minutes ? formatDuration(minutes) : "";
    onLog({
      id,
      kind: "absensi",
      status: "pending",
      savedAt: Date.now(),
      title: formatDate(draft.date),
      subtitle: `${draft.start} – ${draft.end} · ${dur}`,
      report: buildReport(draft, dur),
    });
    patch({ submitted: true, logId: id });
  };

  /* ---------- Tampilan setelah dikirim ---------- */
  if (draft.submitted) {
    return (
      <ReportResult
        heading="Laporan Siap"
        hint="Salin teks di bawah, lalu kirim bersama 4 foto bukti."
        report={buildReport(draft, minutes ? formatDuration(minutes) : "")}
        images={draft.photos.flatMap((ph, i) =>
          ph ? [{ url: ph.url, alt: PHOTO_SLOTS[i].title }] : []
        )}
        copyLabel="Salin Laporan"
        editLabel="Ubah Laporan"
        newLabel="Buat Laporan Baru"
        onEdit={() => patch({ submitted: false })}
        onNew={reset}
      />
    );
  }

  /* ---------- Form ---------- */
  return (
    <div className="pt-stack">
      <section className="pt-card pt-form-card">
        <p className="pt-muted">Form Absensi</p>

        <div className="pt-form">
          <IdentityBlock />

          <label className="pt-field">
            <span>Hari/Tanggal</span>
            <input
              type="date"
              className="pt-input"
              value={draft.date}
              onChange={(e) => patch({ date: e.target.value })}
            />
            {draft.date && <small>{formatDate(draft.date)}</small>}
          </label>

          <div className="pt-row">
            <label className="pt-field">
              <span>Time Duty</span>
              <input
                type="time"
                className="pt-input"
                value={draft.start}
                onChange={(e) => patch({ start: e.target.value })}
              />
            </label>
            <label className="pt-field">
              <span>Time Akhir</span>
              <input
                type="time"
                className="pt-input"
                value={draft.end}
                onChange={(e) => patch({ end: e.target.value })}
              />
            </label>
          </div>

          <div className="pt-field">
            <span>Total Durasi</span>
            <div className={`pt-input pt-readonly ${minutes ? "has-value" : ""}`}>
              <ClockIcon size={20} />
              {minutes ? formatDuration(minutes) : "Otomatis dari jam duty"}
            </div>
            {overnight && <small>Melewati tengah malam</small>}
          </div>

          <label className="pt-field">
            <span>Activity</span>
            <textarea
              className="pt-input pt-textarea"
              rows={4}
              placeholder="Tuliskan kegiatan selama duty…"
              value={draft.activity}
              onChange={(e) => patch({ activity: e.target.value })}
            />
          </label>
        </div>
      </section>

      <section className="pt-card pt-form-card">
        <div className="pt-photos-head">
          <div>
            <p className="pt-form-sub">Sertakan Bukti</p>
            <p className="pt-muted">
              4 foto: buka HP di locker awal duty, 2 kegiatan, buka HP di locker akhir duty.
            </p>
          </div>
          <strong>{photoCount}/4</strong>
        </div>

        <div className="pt-photos">
          {PHOTO_SLOTS.map((slot, i) => {
            const photo = draft.photos[i];
            return (
              <div key={slot.title}>
                <div className={`pt-photo ${photo ? "is-filled" : ""}`}>
                  {photo ? (
                    <img src={photo.url} alt={slot.title} />
                  ) : (
                    <label className="pt-photo-empty">
                      <input
                        type="file"
                        accept="image/*"
                        aria-label={`Unggah foto ${slot.title}`}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) setPhoto(i, f);
                          e.target.value = "";
                        }}
                      />
                      <CameraIcon size={30} />
                      <span>Tambah foto</span>
                    </label>
                  )}
                  <span className="pt-photo-num">{i + 1}</span>
                  {photo && (
                    <button
                      type="button"
                      className="pt-photo-x"
                      aria-label={`Hapus foto ${slot.title}`}
                      onClick={() => setPhoto(i, null)}
                    >
                      <XIcon size={18} />
                    </button>
                  )}
                </div>
                <p className="pt-photo-title">{slot.title}</p>
                <p className="pt-photo-hint">{slot.hint}</p>
              </div>
            );
          })}
        </div>
      </section>

      <button
        type="button"
        className="pt-submit"
        disabled={!valid}
        onClick={submit} // TODO: kirim juga ke backend di sini (mis. FormData + draft.photos[i].file)
      >
        Kirim Laporan
      </button>
      {!valid && <p className="pt-hint">Lengkapi semua kolom dan 4 foto bukti.</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Halaman Izin Cuti — PENGAJUAN IZIN CUTI                              */
/* ------------------------------------------------------------------ */
const JENIS_CUTI = ["IC", "Cuti Sakit", "Cuti Alasan Penting", "Izin Keperluan Pribadi"];

type CutiDraft = {
  name: string;
  jenis: string;
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD
  reason: string;
  submitted: boolean;
  logId: number | null; // id entri di halaman Log (supaya kirim ulang tidak menggandakan)
};

const emptyCuti = (): CutiDraft => ({
  name: personnel.name,
  jenis: JENIS_CUTI[0],
  start: todayISO(),
  end: todayISO(),
  reason: "",
  submitted: false,
  logId: null,
});

/** Selisih hari awal -> akhir (inklusif). null jika tanggal kosong atau akhir < awal. */
function durationDays(start: string, end: string): number | null {
  if (!start || !end) return null;
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  const s = new Date(sy, sm - 1, sd);
  const e = new Date(ey, em - 1, ed);
  const diff = Math.round((e.getTime() - s.getTime()) / 86400000);
  return diff >= 0 ? diff + 1 : null;
}

const buildCutiReport = (d: CutiDraft, hari: number | null) =>
  formatReport("IZIN CUTI SAPD", [
    ["Nama Petugas", d.name.trim()],
    ["Pangkat", personnel.rank],
    ["Devisi", personnel.unit],
    ["Reason", d.reason.trim()],
    ["Dari Tanggal", formatDate(d.start)],
    ["Hingga Tanggal", formatDate(d.end)],
    ["Total Durasi Cuti", hari ? `${hari} hari` : ""],
  ]);

function CutiScreen({
  state,
  setState,
  onLog,
}: {
  state: CutiDraft;
  setState: Dispatch<SetStateAction<CutiDraft>>;
  onLog: (entry: LogEntry) => void;
}) {
  const patch = (p: Partial<CutiDraft>) => setState((d) => ({ ...d, ...p }));
  const hari = durationDays(state.start, state.end);

  const submit = () => {
    const id = state.logId ?? Date.now();
    onLog({
      id,
      kind: "cuti",
      status: "pending",
      savedAt: Date.now(),
      title: `${state.jenis} · ${formatDate(state.start)} – ${formatDate(state.end)}`,
      subtitle: `${hari ? `${hari} hari` : ""} · ${state.reason.trim()}`,
      report: buildCutiReport(state, hari),
    });
    patch({ submitted: true, logId: id });
  };

  const valid =
    state.name.trim() !== "" &&
    state.jenis.trim() !== "" &&
    state.start !== "" &&
    state.end !== "" &&
    hari !== null &&
    state.reason.trim() !== "";

  if (state.submitted) {
    return (
      <ReportResult
        heading="Pengajuan Siap"
        hint="Salin teks di bawah, lalu kirim ke atasan untuk disetujui."
        report={buildCutiReport(state, hari)}
        images={[]}
        copyLabel="Salin Pengajuan"
        editLabel="Ubah Pengajuan"
        newLabel="Buat Pengajuan Baru"
        onEdit={() => patch({ submitted: false })}
        onNew={() => setState(emptyCuti())}
      />
    );
  }

  return (
    <div className="pt-stack">
      <section className="pt-card pt-form-card">
        <p className="pt-muted">Izin Cuti</p>

        <div className="pt-form">
          <IdentityBlock />

          <label className="pt-field">
            <span>Jenis Cuti</span>
            <select
              className="pt-input"
              value={state.jenis}
              onChange={(e) => patch({ jenis: e.target.value })}
            >
              {JENIS_CUTI.map((j) => (
                <option key={j} value={j}>
                  {j}
                </option>
              ))}
            </select>
          </label>

          <div className="pt-row">
            <Field label="Tanggal Mulai">
              <input
                type="date"
                className="pt-input"
                value={state.start}
                onChange={(e) => patch({ start: e.target.value })}
              />
            </Field>
            <Field label="Tanggal Selesai">
              <input
                type="date"
                className="pt-input"
                value={state.end}
                onChange={(e) => patch({ end: e.target.value })}
              />
            </Field>
          </div>

          <div className="pt-field">
            <span>Lama Cuti</span>
            <div className={`pt-input pt-readonly ${hari ? "has-value" : ""}`}>
              <ClockIcon size={20} />
              {hari ? `${hari} hari` : "Otomatis dari tanggal"}
            </div>
            {state.start && state.end && hari === null && (
              <small>Tanggal selesai tidak boleh sebelum tanggal mulai</small>
            )}
          </div>

          <Field label="Alasan" hint="Jelaskan alasan pengajuan cuti / izin.">
            <textarea
              className="pt-input pt-textarea"
              rows={4}
              placeholder="Tuliskan alasan cuti…"
              value={state.reason}
              onChange={(e) => patch({ reason: e.target.value })}
            />
          </Field>
        </div>
      </section>

      <SubmitBar
        label="Ajukan Cuti"
        valid={valid}
        hint="Lengkapi semua kolom dengan benar."
        onSubmit={submit}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Halaman Evidence — DATA PENGGELEDAHAN TERSANGKA                     */
/* ------------------------------------------------------------------ */
type EvidenceDraft = {
  name: string;
  date: string; // YYYY-MM-DD
  suspect: string;
  caseName: string;
  items: string; // barang bukti, satu per baris
  photos: Pic[];
  submitted: boolean;
  logId: number | null; // id entri di halaman Log (supaya kirim ulang tidak menggandakan)
};

const MAX_EVIDENCE_PHOTOS = 6;

const emptyEvidence = (): EvidenceDraft => ({
  name: personnel.name,
  date: todayISO(),
  suspect: "",
  caseName: "",
  items: "",
  photos: [],
  submitted: false,
  logId: null,
});

const buildEvidenceReport = (d: EvidenceDraft) =>
  formatReport("DATA PENGGELEDAHAN TERSANGKA SAPD", [
    ["Nama Petugas", d.name.trim()],
    ["Pangkat", personnel.rank],
    ["Devisi", personnel.unit],
    ["Tanggal", formatDate(d.date)],
    ["Tersangka", d.suspect.trim()],
    ["Kasus", d.caseName.trim()],
    ["Barang Bukti", d.items.trim()],
    ["Bukti Foto", `${d.photos.length} foto`],
  ]);

function EvidenceScreen({
  state,
  setState,
  onLog,
}: {
  state: EvidenceDraft;
  setState: Dispatch<SetStateAction<EvidenceDraft>>;
  onLog: (entry: LogEntry) => void;
}) {
  const patch = (p: Partial<EvidenceDraft>) => setState((d) => ({ ...d, ...p }));

  const submit = () => {
    const id = state.logId ?? Date.now();
    onLog({
      id,
      kind: "evidence",
      status: "pending",
      savedAt: Date.now(),
      title: `Penggeledahan · ${state.suspect.trim()}`,
      subtitle: `Kasus: ${state.caseName.trim()}`,
      report: buildEvidenceReport(state),
    });
    patch({ submitted: true, logId: id });
  };

  const valid =
    state.name.trim() !== "" &&
    state.date !== "" &&
    state.suspect.trim() !== "" &&
    state.caseName.trim() !== "" &&
    state.items.trim() !== "" &&
    state.photos.length >= 2;

  if (state.submitted) {
    return (
      <ReportResult
        heading="Data Siap"
        hint="Salin teks di bawah, lalu kirim bersama bukti foto."
        report={buildEvidenceReport(state)}
        images={state.photos.map((ph, i) => ({ url: ph.url, alt: `Bukti foto ${i + 1}` }))}
        copyLabel="Salin Data"
        editLabel="Ubah Data"
        newLabel="Buat Data Baru"
        onEdit={() => patch({ submitted: false })}
        onNew={() => {
          state.photos.forEach((ph) => URL.revokeObjectURL(ph.url));
          setState(emptyEvidence());
        }}
      />
    );
  }

  return (
    <div className="pt-stack">
      <section className="pt-card pt-form-card">
        <p className="pt-muted">Evidence</p>

        <div className="pt-form">
          <IdentityBlock />

          <div className="pt-row">
            <Field label="Tersangka">
              <input
                className="pt-input"
                placeholder="Nama tersangka"
                value={state.suspect}
                onChange={(e) => patch({ suspect: e.target.value })}
              />
            </Field>

            <Field label="Hari/Tanggal" hint={state.date ? formatDate(state.date) : undefined}>
              <input
                type="date"
                className="pt-input"
                value={state.date}
                onChange={(e) => patch({ date: e.target.value })}
              />
            </Field>
          </div>

          <div className="pt-row">
            <Field label="Kasus">
              <input
                className="pt-input"
                placeholder="Kasus yang menjerat tersangka"
                value={state.caseName}
                onChange={(e) => patch({ caseName: e.target.value })}
              />
            </Field>

            <Field label="Barang Bukti">
              <input
                className="pt-input"
                placeholder="Ganja 1 paket"
                value={state.items}
                onChange={(e) => patch({ items: e.target.value })}
              />
            </Field>
          </div>

          <div className="pt-field">
            <span>
              Bukti Visual / Foto ({state.photos.length}/{MAX_EVIDENCE_PHOTOS})
            </span>
            <PhotoPicker
              photos={state.photos}
              max={MAX_EVIDENCE_PHOTOS}
              label="Bukti foto"
              onChange={(photos) => patch({ photos })}
            />
            <small>Foto barang bukti atau hasil penggeledahan. Minimal 2 foto.</small>
          </div>
        </div>
      </section>

      <SubmitBar
        label="Simpan Data"
        valid={valid}
        hint="Lengkapi semua kolom dan minimal 2 foto."
        onSubmit={submit}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Halaman Cell Management — DATA PENAHANAN TERSANGKA                  */
/* ------------------------------------------------------------------ */
type CellDraft = {
  name: string;
  date: string; // YYYY-MM-DD
  suspect: string;
  pasal: string; // kasus (pasal)
  masa: string; // lama masa tahanan
  denda: string;
  items: string; // barang bukti, satu per baris
  photos: Pic[]; // screenshot saat memenjarakan suspect
  submitted: boolean;
  logId: number | null; // id entri di halaman Log (supaya kirim ulang tidak menggandakan)
};

const MAX_CELL_PHOTOS = 4;

const emptyCellDraft = (): CellDraft => ({
  name: personnel.name,
  date: todayISO(),
  suspect: "",
  pasal: "",
  masa: "",
  denda: "",
  items: "",
  photos: [],
  submitted: false,
  logId: null,
});

const buildCellReport = (d: CellDraft) =>
  formatReport("DATA PENAHANAN TERSANGKA SAPD", [
    ["Nama Petugas", d.name.trim()],
    ["Pangkat", personnel.rank],
    ["Devisi", personnel.unit],
    ["Tanggal", formatDate(d.date)],
    ["Nama Suspect", d.suspect.trim()],
    ["Pasal", d.pasal.trim()],
    ["Lama Tahanan", d.masa.trim()],
    ["Denda", d.denda.trim()],
    ["Barang Bukti", d.items.trim()],
    ["Bukti Foto", `${d.photos.length} foto`],
  ]);

function CellScreen({
  state,
  setState,
  onLog,
}: {
  state: CellDraft;
  setState: Dispatch<SetStateAction<CellDraft>>;
  onLog: (entry: LogEntry) => void;
}) {
  const patch = (p: Partial<CellDraft>) => setState((d) => ({ ...d, ...p }));

  const submit = () => {
    const id = state.logId ?? Date.now();
    onLog({
      id,
      kind: "cell",
      status: "pending",
      savedAt: Date.now(),
      title: `Penahanan · ${state.suspect.trim()}`,
      subtitle: `${state.pasal.trim()} · ${state.masa.trim()}`,
      report: buildCellReport(state),
    });
    patch({ submitted: true, logId: id });
  };

  const valid =
    state.name.trim() !== "" &&
    state.date !== "" &&
    state.suspect.trim() !== "" &&
    state.pasal.trim() !== "" &&
    state.masa.trim() !== "" &&
    state.denda.trim() !== "" &&
    state.items.trim() !== "" &&
    state.photos.length > 0;

  if (state.submitted) {
    return (
      <ReportResult
        heading="Data Siap"
        hint="Salin teks di bawah, lalu kirim bersama screenshot penahanan."
        report={buildCellReport(state)}
        images={state.photos.map((ph, i) => ({ url: ph.url, alt: `Screenshot penahanan ${i + 1}` }))}
        copyLabel="Salin Data"
        editLabel="Ubah Data"
        newLabel="Buat Data Baru"
        onEdit={() => patch({ submitted: false })}
        onNew={() => {
          state.photos.forEach((ph) => URL.revokeObjectURL(ph.url));
          setState(emptyCellDraft());
        }}
      />
    );
  }

  return (
    <div className="pt-stack">
      <section className="pt-card pt-form-card">
        <p className="pt-muted">Cell Management</p>

        <div className="pt-form">
          <IdentityBlock />

          <Field label="Hari/Tanggal" hint={state.date ? formatDate(state.date) : undefined}>
            <input
              type="date"
              className="pt-input"
              value={state.date}
              onChange={(e) => patch({ date: e.target.value })}
            />
          </Field>

          <Field label="Nama Suspect">
            <input
              className="pt-input"
              placeholder="Nama tersangka"
              value={state.suspect}
              onChange={(e) => patch({ suspect: e.target.value })}
            />
          </Field>

          <Field label="Kasus (Pasal)">
            <input
              className="pt-input"
              placeholder="Pasal yang menjerat tersangka"
              value={state.pasal}
              onChange={(e) => patch({ pasal: e.target.value })}
            />
          </Field>

          <div className="pt-row">
            <Field label="Lama Masa Tahanan">
              <input
                className="pt-input"
                placeholder="Contoh: 30 menit"
                value={state.masa}
                onChange={(e) => patch({ masa: e.target.value })}
              />
            </Field>
            <Field label="Denda">
              <input
                className="pt-input"
                placeholder="Contoh: $5.000"
                value={state.denda}
                onChange={(e) => patch({ denda: e.target.value })}
              />
            </Field>
          </div>

          <Field label="Barang Bukti" hint="Satu barang per baris. Isi “-” jika tidak ada.">
            <textarea
              className="pt-input pt-textarea"
              rows={4}
              placeholder={"1x Pistol\n2x Magazine"}
              value={state.items}
              onChange={(e) => patch({ items: e.target.value })}
            />
          </Field>

          <div className="pt-field">
            <span>
              Bukti SS ({state.photos.length}/{MAX_CELL_PHOTOS})
            </span>
            <PhotoPicker
              photos={state.photos}
              max={MAX_CELL_PHOTOS}
              label="Screenshot penahanan"
              onChange={(photos) => patch({ photos })}
            />
            <small>Screenshot saat memenjarakan suspect. Minimal 1 foto.</small>
          </div>
        </div>
      </section>

      <SubmitBar
        label="Simpan Data"
        valid={valid}
        hint="Lengkapi semua kolom dan minimal 1 screenshot."
        onSubmit={submit}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Halaman Tilang Kendaraan — DATA TILANG KENDARAAN                    */
/* ------------------------------------------------------------------ */
type TilangDraft = {
  name: string;
  date: string; // YYYY-MM-DD
  violator: string; // nama pelanggar
  plate: string; // plat nomor
  vehicle: string; // jenis kendaraan
  violation: string; // pelanggaran (pasal)
  fine: string; // denda
  photos: Pic[];
  submitted: boolean;
  logId: number | null; // id entri di halaman Log (supaya kirim ulang tidak menggandakan)
};

const MAX_TILANG_PHOTOS = 4;

const emptyTilang = (): TilangDraft => ({
  name: personnel.name,
  date: todayISO(),
  violator: "",
  plate: "",
  vehicle: "",
  violation: "",
  fine: "",
  photos: [],
  submitted: false,
  logId: null,
});

const buildTilangReport = (d: TilangDraft) =>
  formatReport("DATA TILANG KENDARAAN SAPD", [
    ["Nama Petugas", d.name.trim()],
    ["Pangkat", personnel.rank],
    ["Devisi", personnel.unit],
    ["Tanggal", formatDate(d.date)],
    ["Nama Pelanggar", d.violator.trim()],
    ["Plat Nomor", d.plate.trim()],
    ["Jenis Kendaraan", d.vehicle.trim()],
    ["Pelanggaran", d.violation.trim()],
    ["Denda", d.fine.trim()],
    ["Bukti Foto", `${d.photos.length} foto`],
  ]);

function TilangScreen({
  state,
  setState,
  onLog,
}: {
  state: TilangDraft;
  setState: Dispatch<SetStateAction<TilangDraft>>;
  onLog: (entry: LogEntry) => void;
}) {
  const patch = (p: Partial<TilangDraft>) => setState((d) => ({ ...d, ...p }));

  const submit = () => {
    const id = state.logId ?? Date.now();
    onLog({
      id,
      kind: "tilang",
      status: "pending",
      savedAt: Date.now(),
      title: `Tilang · ${state.plate.trim()}`,
      subtitle: `${state.violator.trim()} · ${state.fine.trim()}`,
      report: buildTilangReport(state),
    });
    patch({ submitted: true, logId: id });
  };

  const valid =
    state.name.trim() !== "" &&
    state.date !== "" &&
    state.violator.trim() !== "" &&
    state.plate.trim() !== "" &&
    state.vehicle.trim() !== "" &&
    state.violation.trim() !== "" &&
    state.fine.trim() !== "" &&
    state.photos.length > 0;

  if (state.submitted) {
    return (
      <ReportResult
        heading="Data Siap"
        hint="Salin teks di bawah, lalu kirim bersama bukti foto."
        report={buildTilangReport(state)}
        images={state.photos.map((ph, i) => ({ url: ph.url, alt: `Bukti tilang ${i + 1}` }))}
        copyLabel="Salin Data"
        editLabel="Ubah Data"
        newLabel="Buat Data Baru"
        onEdit={() => patch({ submitted: false })}
        onNew={() => {
          state.photos.forEach((ph) => URL.revokeObjectURL(ph.url));
          setState(emptyTilang());
        }}
      />
    );
  }

  return (
    <div className="pt-stack">
      <section className="pt-card pt-form-card">
        <p className="pt-muted">Tilang Kendaraan</p>

        <div className="pt-form">
          <IdentityBlock />

          <Field label="Hari/Tanggal" hint={state.date ? formatDate(state.date) : undefined}>
            <input
              type="date"
              className="pt-input"
              value={state.date}
              onChange={(e) => patch({ date: e.target.value })}
            />
          </Field>

          <Field label="Nama Pelanggar">
            <input
              className="pt-input"
              placeholder="Nama pemilik / pengemudi"
              value={state.violator}
              onChange={(e) => patch({ violator: e.target.value })}
            />
          </Field>

          <div className="pt-row">
            <Field label="Plat Nomor">
              <input
                className="pt-input"
                placeholder="Contoh: AB 1234 CD"
                autoCapitalize="characters"
                value={state.plate}
                onChange={(e) => patch({ plate: e.target.value.toUpperCase() })}
              />
            </Field>
            <Field label="Jenis Kendaraan">
              <input
                className="pt-input"
                placeholder="Contoh: Sultan"
                value={state.vehicle}
                onChange={(e) => patch({ vehicle: e.target.value })}
              />
            </Field>
          </div>

          <Field label="Pelanggaran" hint="Tulis pelanggaran beserta pasalnya.">
            <textarea
              className="pt-input pt-textarea"
              rows={3}
              placeholder="Contoh: Melanggar lampu merah (Pasal …)"
              value={state.violation}
              onChange={(e) => patch({ violation: e.target.value })}
            />
          </Field>

          <Field label="Denda">
            <input
              className="pt-input"
              placeholder="Contoh: $500"
              value={state.fine}
              onChange={(e) => patch({ fine: e.target.value })}
            />
          </Field>

          <div className="pt-field">
            <span>
              Bukti Foto ({state.photos.length}/{MAX_TILANG_PHOTOS})
            </span>
            <PhotoPicker
              photos={state.photos}
              max={MAX_TILANG_PHOTOS}
              label="Bukti tilang"
              onChange={(photos) => patch({ photos })}
            />
            <small>Foto kendaraan dan pelanggarannya. Minimal 1 foto.</small>
          </div>
        </div>
      </section>

      <SubmitBar
        label="Simpan Data"
        valid={valid}
        hint="Lengkapi semua kolom dan minimal 1 foto."
        onSubmit={submit}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Halaman Impound Kendaraan — DATA IMPOUND KENDARAAN                  */
/* ------------------------------------------------------------------ */
type ImpoundDraft = {
  name: string;
  date: string; // YYYY-MM-DD
  owner: string; // nama pemilik
  plate: string; // plat nomor
  vehicle: string; // jenis kendaraan
  location: string; // lokasi kendaraan diamankan
  reason: string; // alasan impound (pasal)
  fee: string; // biaya impound
  photos: Pic[];
  submitted: boolean;
  logId: number | null; // id entri di halaman Log (supaya kirim ulang tidak menggandakan)
};

const MAX_IMPOUND_PHOTOS = 4;

const emptyImpound = (): ImpoundDraft => ({
  name: personnel.name,
  date: todayISO(),
  owner: "",
  plate: "",
  vehicle: "",
  location: "",
  reason: "",
  fee: "",
  photos: [],
  submitted: false,
  logId: null,
});

const buildImpoundReport = (d: ImpoundDraft) =>
  formatReport("DATA IMPOUND KENDARAAN SAPD", [
    ["Nama Petugas", d.name.trim()],
    ["Pangkat", personnel.rank],
    ["Devisi", personnel.unit],
    ["Tanggal", formatDate(d.date)],
    ["Nama Pemilik", d.owner.trim()],
    ["Plat Nomor", d.plate.trim()],
    ["Jenis Kendaraan", d.vehicle.trim()],
    ["Lokasi", d.location.trim()],
    ["Alasan Impound", d.reason.trim()],
    ["Biaya Impound", d.fee.trim()],
    ["Bukti Foto", `${d.photos.length} foto`],
  ]);

function ImpoundScreen({
  state,
  setState,
  onLog,
}: {
  state: ImpoundDraft;
  setState: Dispatch<SetStateAction<ImpoundDraft>>;
  onLog: (entry: LogEntry) => void;
}) {
  const patch = (p: Partial<ImpoundDraft>) => setState((d) => ({ ...d, ...p }));

  const submit = () => {
    const id = state.logId ?? Date.now();
    onLog({
      id,
      kind: "impound",
      status: "pending",
      savedAt: Date.now(),
      title: `Impound · ${state.plate.trim()}`,
      subtitle: `${state.owner.trim()} · ${state.fee.trim()}`,
      report: buildImpoundReport(state),
    });
    patch({ submitted: true, logId: id });
  };

  const valid =
    state.name.trim() !== "" &&
    state.date !== "" &&
    state.owner.trim() !== "" &&
    state.plate.trim() !== "" &&
    state.vehicle.trim() !== "" &&
    state.location.trim() !== "" &&
    state.reason.trim() !== "" &&
    state.fee.trim() !== "" &&
    state.photos.length > 0;

  if (state.submitted) {
    return (
      <ReportResult
        heading="Data Siap"
        hint="Salin teks di bawah, lalu kirim bersama bukti foto."
        report={buildImpoundReport(state)}
        images={state.photos.map((ph, i) => ({ url: ph.url, alt: `Bukti impound ${i + 1}` }))}
        copyLabel="Salin Data"
        editLabel="Ubah Data"
        newLabel="Buat Data Baru"
        onEdit={() => patch({ submitted: false })}
        onNew={() => {
          state.photos.forEach((ph) => URL.revokeObjectURL(ph.url));
          setState(emptyImpound());
        }}
      />
    );
  }

  return (
    <div className="pt-stack">
      <section className="pt-card pt-form-card">
        <p className="pt-muted">Impound Kendaraan</p>

        <div className="pt-form">
          <IdentityBlock />

          <Field label="Hari/Tanggal" hint={state.date ? formatDate(state.date) : undefined}>
            <input
              type="date"
              className="pt-input"
              value={state.date}
              onChange={(e) => patch({ date: e.target.value })}
            />
          </Field>

          <Field label="Nama Pemilik">
            <input
              className="pt-input"
              placeholder="Nama pemilik kendaraan"
              value={state.owner}
              onChange={(e) => patch({ owner: e.target.value })}
            />
          </Field>

          <div className="pt-row">
            <Field label="Plat Nomor">
              <input
                className="pt-input"
                placeholder="Contoh: AB 1234 CD"
                autoCapitalize="characters"
                value={state.plate}
                onChange={(e) => patch({ plate: e.target.value.toUpperCase() })}
              />
            </Field>
            <Field label="Jenis Kendaraan">
              <input
                className="pt-input"
                placeholder="Contoh: Sultan"
                value={state.vehicle}
                onChange={(e) => patch({ vehicle: e.target.value })}
              />
            </Field>
          </div>

          <Field label="Lokasi" hint="Tempat kendaraan diamankan.">
            <input
              className="pt-input"
              placeholder="Contoh: Jl. Utama, depan bank"
              value={state.location}
              onChange={(e) => patch({ location: e.target.value })}
            />
          </Field>

          <Field label="Alasan Impound" hint="Tulis alasan beserta pasalnya.">
            <textarea
              className="pt-input pt-textarea"
              rows={3}
              placeholder="Contoh: Parkir sembarangan (Pasal …)"
              value={state.reason}
              onChange={(e) => patch({ reason: e.target.value })}
            />
          </Field>

          <Field label="Biaya Impound">
            <input
              className="pt-input"
              placeholder="Contoh: $1.000"
              value={state.fee}
              onChange={(e) => patch({ fee: e.target.value })}
            />
          </Field>

          <div className="pt-field">
            <span>
              Bukti Foto ({state.photos.length}/{MAX_IMPOUND_PHOTOS})
            </span>
            <PhotoPicker
              photos={state.photos}
              max={MAX_IMPOUND_PHOTOS}
              label="Bukti impound"
              onChange={(photos) => patch({ photos })}
            />
            <small>Foto kendaraan sebelum diderek. Minimal 1 foto.</small>
          </div>
        </div>
      </section>

      <SubmitBar
        label="Simpan Data"
        valid={valid}
        hint="Lengkapi semua kolom dan minimal 1 foto."
        onSubmit={submit}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Halaman Log — Log Absensi & Log Laporan                             */
/* ------------------------------------------------------------------ */
const LOG_KIND_META: Record<LogKind, { label: string; Icon: (p: IconProps) => JSX.Element }> = {
  absensi: { label: "Absensi", Icon: CalendarCheckIcon },
  cuti: { label: "Izin Cuti", Icon: FileTextIcon },
  evidence: { label: "Evidence", Icon: SearchIcon },
  cell: { label: "Cell Management", Icon: ShieldAlertIcon },
  tilang: { label: "Tilang", Icon: TicketIcon },
  impound: { label: "Impound", Icon: TruckIcon },
};

function LogScreen({ logs, onRemove }: { logs: LogEntry[]; onRemove: (id: number) => void }) {
  const [tab, setTab] = useState<"absensi" | "laporan">("absensi");
  const [openId, setOpenId] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const absensi = logs.filter((l) => l.kind === "absensi" || l.kind === "cuti");
  const laporan = logs.filter((l) => l.kind !== "absensi" && l.kind !== "cuti");
  const list = tab === "absensi" ? absensi : laporan;

  const copy = async (entry: LogEntry) => {
    try {
      await navigator.clipboard.writeText(entry.report);
      setCopiedId(entry.id);
      setTimeout(() => setCopiedId((c) => (c === entry.id ? null : c)), 2000);
    } catch {
      /* clipboard tidak tersedia — teks bisa disalin manual dari kotak */
    }
  };

  const tabs = [
    { id: "absensi", label: "Log Absensi", count: absensi.length },
    { id: "laporan", label: "Log Laporan", count: laporan.length },
  ] as const;

  return (
    <div className="pt-stack">
      <div className="pt-seg" role="tablist" aria-label="Jenis log">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`pt-seg-btn ${tab === t.id ? "is-active" : ""}`}
            onClick={() => {
              setTab(t.id);
              setOpenId(null);
              setConfirmId(null);
            }}
          >
            {t.label}
            <span className="pt-seg-count">{t.count}</span>
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <section className="pt-card pt-log-empty">
          <p className="pt-log-empty-title">
            {tab === "absensi" ? "Belum ada log absensi" : "Belum ada log laporan"}
          </p>
          <p className="pt-extra-text">
            {tab === "absensi"
              ? "Kirim laporan duty atau ajukan izin cuti dari halaman Absensi, lalu riwayatnya muncul di sini."
              : "Simpan data dari menu Laporan (Evidence, Cell, Tilang, atau Impound), lalu riwayatnya muncul di sini."}
          </p>
        </section>
      ) : (
        <ul className="pt-log-list">
          {list.map((entry) => {
            const { label, Icon } = LOG_KIND_META[entry.kind];
            const st = STATUS_META[entry.status];
            const open = openId === entry.id;
            return (
              <li key={entry.id} className={`pt-log-item ${open ? "is-open" : ""}`}>
                <button
                  type="button"
                  className="pt-log-head"
                  aria-expanded={open}
                  onClick={() => {
                    setOpenId(open ? null : entry.id);
                    setConfirmId(null);
                  }}
                >
                  <span className="pt-ops-ico pt-log-ico">
                    <Icon size={20} />
                  </span>
                  <span className="pt-log-text">
                    <span className="pt-log-kind">{label}</span>
                    <strong className="pt-log-title">{entry.title}</strong>
                    <span className="pt-log-sub">{entry.subtitle}</span>
                    <span className="pt-log-time">{formatSavedAt(entry.savedAt)}</span>
                  </span>
                  <span className={`pt-status-pill ${st.className}`}>{st.label}</span>
                  <ChevronDownIcon size={20} className="pt-log-chev" />
                </button>

                {open && (
                  <div className="pt-log-body">
                    <pre className="pt-report">{entry.report}</pre>
                    <div className="pt-log-actions">
                      <button type="button" className="pt-secondary" onClick={() => copy(entry)}>
                        {copiedId === entry.id ? "Tersalin ✓" : "Salin"}
                      </button>
                      <button
                        type="button"
                        className="pt-secondary is-danger"
                        onClick={() => {
                          if (confirmId === entry.id) {
                            onRemove(entry.id);
                            setConfirmId(null);
                            setOpenId(null);
                          } else {
                            setConfirmId(entry.id);
                          }
                        }}
                      >
                        {confirmId === entry.id ? "Yakin hapus?" : "Hapus"}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Halaman Admin — approve Absensi/Cuti/Laporan + kelola akses         */
/* Hanya pemilik akun (personnel.name) dan nama yang ditambahkan ke    */
/* daftar akses yang bisa masuk, dengan PIN yang diatur oleh pemilik.  */
/* Catatan: ini gerbang PIN sederhana yang tersimpan di localStorage   */
/* perangkat ini — bukan autentikasi server, jadi PIN hanya sekuat     */
/* seberapa rahasia PIN itu dijaga.                                    */
/* ------------------------------------------------------------------ */
type AdminAccess = { name: string };
type AdminAuth = { pin: string; access: AdminAccess[] };

const ADMIN_AUTH_KEY = "pt-admin-auth-v1";

function loadAdminAuth(): AdminAuth | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(ADMIN_AUTH_KEY) ?? "null");
    if (parsed && typeof parsed.pin === "string" && Array.isArray(parsed.access)) return parsed;
    return null;
  } catch {
    return null;
  }
}
function saveAdminAuth(auth: AdminAuth) {
  try {
    window.localStorage.setItem(ADMIN_AUTH_KEY, JSON.stringify(auth));
  } catch {
    /* penyimpanan penuh / dinonaktifkan */
  }
}

/** Pemilik akun selalu boleh masuk; selain itu hanya nama di daftar akses. */
function isNameAuthorized(auth: AdminAuth, name: string) {
  const n = name.trim().toLowerCase();
  if (!n) return false;
  if (n === personnel.name.trim().toLowerCase()) return true;
  return auth.access.some((a) => a.name.trim().toLowerCase() === n);
}

const STATUS_META: Record<LogStatus, { label: string; className: string }> = {
  pending: { label: "Menunggu", className: "is-pending" },
  approved: { label: "Disetujui", className: "is-approved" },
  rejected: { label: "Ditolak", className: "is-rejected" },
};

function AdminSetup({ onSetupPin }: { onSetupPin: (pin: string) => void }) {
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const valid = pin.length >= 4 && pin === confirm;

  return (
    <div className="pt-stack">
      <section className="pt-card pt-form-card">
        <p className="pt-muted">Admin</p>
        <h2 className="pt-form-title">Atur PIN Admin</h2>
        <p className="pt-muted" style={{ marginTop: 8 }}>
          PIN ini melindungi menu persetujuan Absensi, Izin Cuti, dan Laporan. Hanya Anda dan
          orang yang Anda beri akses yang bisa masuk ke sini.
        </p>

        <div className="pt-form">
          <Field label="PIN Baru" hint="Minimal 4 digit/karakter.">
            <input
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              className="pt-input"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
            />
          </Field>
          <Field label="Ulangi PIN">
            <input
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              className="pt-input"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </Field>
        </div>
      </section>

      <SubmitBar
        label="Simpan PIN"
        valid={valid}
        hint="PIN minimal 4 karakter dan harus sama dengan konfirmasi."
        onSubmit={() => onSetupPin(pin)}
      />
    </div>
  );
}

function AdminLogin({ onLogin }: { onLogin: (name: string, pin: string) => boolean }) {
  const [name, setName] = useState(personnel.name);
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);

  const submit = () => setError(!onLogin(name, pin));

  return (
    <div className="pt-stack">
      <section className="pt-card pt-form-card">
        <p className="pt-muted">Admin</p>
        <h2 className="pt-form-title">Masuk Admin</h2>
        <p className="pt-muted" style={{ marginTop: 8 }}>
          Khusus pemilik akun dan orang yang sudah diberi akses.
        </p>

        <div className="pt-form">
          <Field label="Nama">
            <input
              className="pt-input"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(false);
              }}
              autoComplete="name"
            />
          </Field>
          <Field label="PIN Admin">
            <input
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              className="pt-input"
              value={pin}
              onChange={(e) => {
                setPin(e.target.value);
                setError(false);
              }}
            />
          </Field>
        </div>

        {error && (
          <p className="pt-hint" style={{ color: "var(--red)", marginTop: 12 }}>
            Nama atau PIN salah, atau Anda belum diberi akses.
          </p>
        )}
      </section>

      <button
        type="button"
        className="pt-submit"
        disabled={!name.trim() || !pin}
        onClick={submit}
      >
        Masuk
      </button>
    </div>
  );
}

function AdminApprovals({
  logs,
  onDecide,
}: {
  logs: LogEntry[];
  onDecide: (id: number, status: "approved" | "rejected") => void;
}) {
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [openId, setOpenId] = useState<number | null>(null);

  const pendingCount = logs.filter((l) => l.status === "pending").length;
  const list = (filter === "pending" ? logs.filter((l) => l.status === "pending") : logs)
    .slice()
    .sort((a, b) => {
      if (a.status === "pending" && b.status !== "pending") return -1;
      if (a.status !== "pending" && b.status === "pending") return 1;
      return b.savedAt - a.savedAt;
    });

  return (
    <div className="pt-stack">
      <div className="pt-seg" role="tablist" aria-label="Filter persetujuan">
        <button
          type="button"
          role="tab"
          aria-selected={filter === "pending"}
          className={`pt-seg-btn ${filter === "pending" ? "is-active" : ""}`}
          onClick={() => {
            setFilter("pending");
            setOpenId(null);
          }}
        >
          Menunggu
          <span className="pt-seg-count">{pendingCount}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={filter === "all"}
          className={`pt-seg-btn ${filter === "all" ? "is-active" : ""}`}
          onClick={() => {
            setFilter("all");
            setOpenId(null);
          }}
        >
          Semua
          <span className="pt-seg-count">{logs.length}</span>
        </button>
      </div>

      {list.length === 0 ? (
        <section className="pt-card pt-log-empty">
          <p className="pt-log-empty-title">
            {filter === "pending" ? "Tidak ada yang menunggu persetujuan" : "Belum ada data"}
          </p>
          <p className="pt-extra-text">
            Laporan Absensi, Izin Cuti, dan Laporan Ops yang dikirim petugas akan muncul di sini.
          </p>
        </section>
      ) : (
        <ul className="pt-log-list">
          {list.map((entry) => {
            const { label, Icon } = LOG_KIND_META[entry.kind];
            const st = STATUS_META[entry.status];
            const open = openId === entry.id;
            return (
              <li key={entry.id} className={`pt-log-item ${open ? "is-open" : ""}`}>
                <button
                  type="button"
                  className="pt-log-head"
                  aria-expanded={open}
                  onClick={() => setOpenId(open ? null : entry.id)}
                >
                  <span className="pt-ops-ico pt-log-ico">
                    <Icon size={20} />
                  </span>
                  <span className="pt-log-text">
                    <span className="pt-log-kind">{label}</span>
                    <strong className="pt-log-title">{entry.title}</strong>
                    <span className="pt-log-sub">{entry.subtitle}</span>
                    <span className="pt-log-time">{formatSavedAt(entry.savedAt)}</span>
                  </span>
                  <span className={`pt-status-pill ${st.className}`}>{st.label}</span>
                  <ChevronDownIcon size={20} className="pt-log-chev" />
                </button>

                {open && (
                  <div className="pt-log-body">
                    <pre className="pt-report">{entry.report}</pre>
                    {entry.decidedBy && (
                      <p className="pt-photo-hint" style={{ marginTop: 10 }}>
                        {st.label} oleh {entry.decidedBy}
                        {entry.decidedAt ? ` · ${formatSavedAt(entry.decidedAt)}` : ""}
                      </p>
                    )}
                    {entry.status === "pending" && (
                      <div className="pt-log-actions">
                        <button
                          type="button"
                          className="pt-secondary"
                          onClick={() => onDecide(entry.id, "approved")}
                        >
                          Setujui
                        </button>
                        <button
                          type="button"
                          className="pt-secondary is-danger"
                          onClick={() => onDecide(entry.id, "rejected")}
                        >
                          Tolak
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function AdminAccessManager({
  auth,
  onAddAccess,
  onRemoveAccess,
  onChangePin,
}: {
  auth: AdminAuth;
  onAddAccess: (name: string) => void;
  onRemoveAccess: (name: string) => void;
  onChangePin: (oldPin: string, newPin: string) => boolean;
}) {
  const [name, setName] = useState("");
  const [showPinForm, setShowPinForm] = useState(false);
  const [oldPin, setOldPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [pinMsg, setPinMsg] = useState<string | null>(null);

  const add = () => {
    if (!name.trim()) return;
    onAddAccess(name.trim());
    setName("");
  };

  const submitPin = () => {
    const ok = onChangePin(oldPin, newPin);
    setPinMsg(ok ? "PIN berhasil diubah." : "PIN lama salah.");
    if (ok) {
      setOldPin("");
      setNewPin("");
    }
  };

  return (
    <section className="pt-card pt-form-card">
      <p className="pt-muted">Khusus Anda</p>
      <h2 className="pt-form-title">Kelola Akses</h2>
      <p className="pt-muted" style={{ marginTop: 8 }}>
        Tambahkan nama orang yang boleh masuk menu Admin ini, lalu bagikan PIN Admin kepadanya.
      </p>

      <div className="pt-row" style={{ marginTop: 18 }}>
        <input
          className="pt-input"
          placeholder="Nama lengkap"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button type="button" className="pt-secondary pt-access-add" onClick={add}>
          Tambah
        </button>
      </div>

      {auth.access.length === 0 ? (
        <p className="pt-photo-hint" style={{ marginTop: 14 }}>
          Belum ada orang lain yang diberi akses.
        </p>
      ) : (
        <ul className="pt-access-list">
          {auth.access.map((a) => (
            <li key={a.name}>
              <span>{a.name}</span>
              <button
                type="button"
                className="pt-photo-x"
                aria-label={`Hapus akses ${a.name}`}
                onClick={() => onRemoveAccess(a.name)}
              >
                <XIcon size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        className="pt-secondary"
        style={{ marginTop: 18 }}
        onClick={() => {
          setShowPinForm((s) => !s);
          setPinMsg(null);
        }}
      >
        {showPinForm ? "Batal Ubah PIN" : "Ubah PIN Admin"}
      </button>

      {showPinForm && (
        <div className="pt-form" style={{ marginTop: 12 }}>
          <Field label="PIN Lama">
            <input
              type="password"
              inputMode="numeric"
              className="pt-input"
              value={oldPin}
              onChange={(e) => setOldPin(e.target.value)}
            />
          </Field>
          <Field label="PIN Baru">
            <input
              type="password"
              inputMode="numeric"
              className="pt-input"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value)}
            />
          </Field>
          <button
            type="button"
            className="pt-submit"
            disabled={oldPin.length < 4 || newPin.length < 4}
            onClick={submitPin}
          >
            Simpan PIN Baru
          </button>
          {pinMsg && <p className="pt-hint">{pinMsg}</p>}
        </div>
      )}
    </section>
  );
}

function AdminScreen({
  auth,
  unlocked,
  loggedInAs,
  onSetupPin,
  onLogin,
  onLogout,
  onAddAccess,
  onRemoveAccess,
  onChangePin,
  logs,
  onDecide,
}: {
  auth: AdminAuth | null;
  unlocked: boolean;
  loggedInAs: string | null;
  onSetupPin: (pin: string) => void;
  onLogin: (name: string, pin: string) => boolean;
  onLogout: () => void;
  onAddAccess: (name: string) => void;
  onRemoveAccess: (name: string) => void;
  onChangePin: (oldPin: string, newPin: string) => boolean;
  logs: LogEntry[];
  onDecide: (id: number, status: "approved" | "rejected") => void;
}) {
  if (!auth) return <AdminSetup onSetupPin={onSetupPin} />;
  if (!unlocked) return <AdminLogin onLogin={onLogin} />;

  const isOwner = loggedInAs?.trim().toLowerCase() === personnel.name.trim().toLowerCase();

  return (
    <div className="pt-stack">
      <section className="pt-card pt-admin-who">
        <div>
          <p className="pt-muted">Masuk sebagai</p>
          <strong>{loggedInAs}</strong>
        </div>
        <button type="button" className="pt-secondary" onClick={onLogout}>
          Keluar
        </button>
      </section>

      <AdminApprovals logs={logs} onDecide={onDecide} />

      {isOwner && (
        <AdminAccessManager
          auth={auth}
          onAddAccess={onAddAccess}
          onRemoveAccess={onRemoveAccess}
          onChangePin={onChangePin}
        />
      )}
    </div>
  );
}

type Dir = "forward" | "back" | "fade";
const depth = (s: Screen) =>
  s === "evidence" ||
  s === "cell" ||
  s === "tilang" ||
  s === "impound" ||
  s === "absensi-form" ||
  s === "cuti"
    ? 2
    : s === "absensi" || s === "laporan"
    ? 1
    : 0;

type Boot = "scan" | "ok" | "out" | "done";

/** Titik-titik bintang lima (untuk atribut `points` pada <polygon>). */
const starPoints = (cx: number, cy: number, R: number, r: number, n = 5) =>
  Array.from({ length: n * 2 }, (_, i) => {
    const ang = (Math.PI / n) * i - Math.PI / 2;
    const rad = i % 2 === 0 ? R : r;
    return `${(cx + rad * Math.cos(ang)).toFixed(1)},${(cy + rad * Math.sin(ang)).toFixed(1)}`;
  }).join(" ");

/** Sinar matahari ala poster retro di belakang perisai. */
const SUNBURST = Array.from({ length: 24 }, (_, i) => {
  const a1 = (Math.PI * 2 * i) / 24;
  const a2 = a1 + Math.PI / 24;
  const pt = (a: number) => `${(120 + 78 * Math.cos(a)).toFixed(1)} ${(120 + 78 * Math.sin(a)).toFixed(1)}`;
  return `M120 120 L${pt(a1)} L${pt(a2)} Z`;
}).join(" ");

/** Logo lencana gaya retro (vektor SVG, tanpa file gambar — jadi tidak bisa error saat dimuat). */
function PoliceLogo() {
  const font = "Georgia, 'Times New Roman', serif";
  const ringText = { fontFamily: font, fontSize: 13, fontWeight: 700, letterSpacing: 2.4, fill: "#f3e6c4" };
  return (
    <svg
      className="pt-logo"
      viewBox="0 0 240 240"
      role="img"
      aria-label="Logo High State Police Department"
    >
      <defs>
        <path id="pt-arc-top" d="M31 120 A89 89 0 0 1 209 120" />
        <path id="pt-arc-bottom" d="M21 120 A99 99 0 0 0 219 120" />
      </defs>

      {/* Cincin luar */}
      <circle cx="120" cy="120" r="116" fill="#f3e6c4" />
      <circle cx="120" cy="120" r="110" fill="#17264a" />
      <circle cx="120" cy="120" r="106" fill="none" stroke="#e0a526" strokeWidth="1.5" />
      <text {...ringText} textAnchor="middle">
        <textPath href="#pt-arc-top" startOffset="50%">
          STATE OF HIGH STATE
        </textPath>
      </text>
      <text {...ringText} textAnchor="middle">
        <textPath href="#pt-arc-bottom" startOffset="50%">
          PUBLIC SAFETY &amp; SERVICE
        </textPath>
      </text>
      <polygon points={starPoints(24, 120, 6, 2.5)} fill="#e0a526" />
      <polygon points={starPoints(216, 120, 6, 2.5)} fill="#e0a526" />

      {/* Cakram tengah + sinar */}
      <circle cx="120" cy="120" r="80" fill="#f3e6c4" stroke="#e0a526" strokeWidth="3" />
      <path d={SUNBURST} fill="#e0a526" opacity="0.28" />

      {/* Perisai */}
      <path
        d="M120 62 L166 76 V120 C166 150 146 170 120 182 C94 170 74 150 74 120 V76 Z"
        fill="#17264a"
        stroke="#d9622b"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <polygon points={starPoints(120, 108, 24, 9.6)} fill="#e0a526" />
      <text
        x="120"
        y="148"
        textAnchor="middle"
        style={{ fontFamily: font, fontSize: 15, fontWeight: 800, letterSpacing: 1.5, fill: "#f3e6c4" }}
      >
        POLICE
      </text>
      <polygon points={starPoints(120, 164, 5, 2)} fill="#e0a526" />
    </svg>
  );
}

const BOOT_TEXTS = [
  "ABSENSI AND REPORT WEB",
  "HIGH STATE POLICE DEPARTMENT",
  "WEB BY iaann",
];

/** Progres 0–100 yang naik linear selama `duration` ms sejak komponen tampil. */
function useLoadProgress(duration: number) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setValue(Math.round(t * 100));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [duration]);
  return value;
}

/**
 * Layar loading: logo, bar persen, lalu tulisan yang berganti-ganti.
 * Saat pertama dibuka teksnya bergilir (BOOT_TEXTS); saat pindah halaman
 * (fast) cukup satu tulisan "Membuka …" dan barnya lebih cepat.
 */
function Splash({
  phase,
  fast,
  label,
}: {
  phase: Exclude<Boot, "done">;
  fast: boolean;
  label: string;
}) {
  const progress = useLoadProgress(fast ? TIMING.nav.ok : TIMING.boot.ok);
  const texts = fast ? [label] : BOOT_TEXTS;
  const idx = Math.min(texts.length - 1, Math.floor((progress / 100) * texts.length));

  return (
    <div
      className={`pt-splash ${fast ? "is-fast" : ""} ${phase === "out" ? "is-out" : ""}`}
      role="status"
      aria-label="Memuat"
    >
      <div className="pt-logo-wrap">
        <PoliceLogo />
      </div>

      <div className="pt-loadbar">
        <div
          className="pt-loadtrack"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="pt-loadfill" style={{ width: `${progress}%` }} />
        </div>
        <span className="pt-loadpct">{progress}%</span>
      </div>

      <p key={idx} className="pt-loadtext">
        {texts[idx]}
      </p>
    </div>
  );
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Durasi (ms) tiap tahap layar pembuka. Ubah angka ini untuk mempercepat / memperlambat.
const TIMING = {
  // ok = bar mencapai 100%, out = mulai memudar, done = layar pembuka dilepas
  boot: { ok: 4600, out: 5000, done: 5450 }, // saat aplikasi pertama dibuka
  nav: { ok: 850, out: 1050, done: 1450 }, // saat pindah halaman
};

/**
 * Layar loading pembuka: logo memantul seperti bola pingpong, polisi stickman
 * mengejar & menembak penjahat, lalu gorden menutup ("Tamat").
 * Gambar logo: taruh file di public/badge.webp (kalau tidak ada, dipakai logo bawaan).
 */
function BootLoading({ phase }: { phase: Boot }) {
  const progress = useLoadProgress(TIMING.boot.ok);
  const arenaRef = useRef<HTMLDivElement>(null);
  const ballRef = useRef<HTMLDivElement>(null);
  const [imgOk, setImgOk] = useState(true);

  // Logo memantul di dalam area (seperti bola pingpong), gepeng sedikit saat kena sisi
  useEffect(() => {
    const arena = arenaRef.current;
    const ball = ballRef.current;
    if (!arena || !ball) return;
    const size = 52;
    const speed = 150; // px per detik
    const groundH = 56; // area kejar-kejaran di bawah, tidak dilewati logo
    let x = 30;
    let y = 40;
    let vx = speed * 0.9;
    let vy = speed * 0.75;
    let sx = 1;
    let sy = 1;
    let last = 0;
    let w = 0;
    let h = 0;
    let raf = 0;

    const measure = () => {
      w = arena.clientWidth - size;
      h = arena.clientHeight - size - groundH;
    };
    const draw = () => {
      ball.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) scale(${sx.toFixed(3)},${sy.toFixed(3)})`;
    };
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      x += vx * dt;
      y += vy * dt;
      if (x <= 0) { x = 0; vx = Math.abs(vx); sx = 0.72; sy = 1.22; }
      else if (x >= w) { x = w; vx = -Math.abs(vx); sx = 0.72; sy = 1.22; }
      if (y <= 0) { y = 0; vy = Math.abs(vy); sx = 1.22; sy = 0.72; }
      else if (y >= h) { y = h; vy = -Math.abs(vy); sx = 1.22; sy = 0.72; }
      sx += (1 - sx) * Math.min(dt * 14, 1);
      sy += (1 - sy) * Math.min(dt * 14, 1);
      draw();
      raf = requestAnimationFrame(frame);
    };

    measure();
    window.addEventListener("resize", measure);
    if (prefersReducedMotion()) {
      x = w / 2;
      y = h / 2;
      draw();
    } else {
      raf = requestAnimationFrame((n) => {
        last = n;
        frame(n);
      });
    }
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
    };
  }, []);

  return (
    <div className={`bl-root ${phase === "out" ? "is-out" : ""}`} role="status" aria-label="Memuat">
      <div className="bl-box">
        <p className="bl-credit">By.@iaann</p>

        <div className="bl-arena" ref={arenaRef}>
          <div className="bl-ball" ref={ballRef}>
            {imgOk ? (
              <img src="/badge.webp" alt="" onError={() => setImgOk(false)} />
            ) : (
              <PoliceLogo />
            )}
          </div>

          <div className="bl-chase" aria-hidden="true">
            <div className="bl-thief bl-runner">
              <svg viewBox="0 0 44 52">
                <circle cx="20" cy="10" r="5.5" />
                <path d="M20 16 L20 32" />
                <g className="bl-t-run">
                  <rect x="15" y="8" width="10" height="3" rx="1" fill="#ef4444" stroke="none" />
                  <g className="bl-pa">
                    <path d="M20 20 L27 24 L30 27" />
                    <path d="M20 20 L13 26" />
                    <path d="M20 32 L28 41 L26 50" />
                    <path d="M20 32 L13 40 L9 47" />
                  </g>
                  <g className="bl-pb">
                    <path d="M20 20 L26 22 L30 26" />
                    <path d="M20 20 L14 27" />
                    <path d="M20 32 L26 40 L30 47" />
                    <path d="M20 32 L15 42 L15 50" />
                  </g>
                  <circle cx="32" cy="29" r="4.2" fill="#8a6a2a" stroke="#d4a94f" strokeWidth="1.6" />
                </g>
                <g className="bl-t-fall">
                  <path d="M16.5 8 l3 3 m0 -3 l-3 3 M21.5 8 l3 3 m0 -3 l-3 3" stroke="#ef4444" strokeWidth="1.5" />
                  <path d="M20 20 L10 13" />
                  <path d="M20 20 L31 14" />
                  <path d="M20 32 L12 50" />
                  <path d="M20 32 L28 49" />
                  <circle cx="37" cy="46" r="4.2" fill="#8a6a2a" stroke="#d4a94f" strokeWidth="1.6" />
                </g>
              </svg>
            </div>

            <div className="bl-cop bl-runner">
              <svg viewBox="0 0 44 52">
                <circle cx="20" cy="10" r="5.5" />
                <path d="M14 7.5 h12 l-1 -4.5 h-10 z" fill="#d4a94f" stroke="none" />
                <path d="M12 7.5 h16" stroke="#d4a94f" />
                <path d="M20 16 L20 32" />
                <g className="bl-c-run">
                  <g className="bl-pa">
                    <path d="M20 20 L28 25" />
                    <path d="M28 25 L35 21" stroke="#d4a94f" />
                    <path d="M20 20 L13 26" />
                    <path d="M20 32 L28 41 L26 50" />
                    <path d="M20 32 L13 40 L9 47" />
                  </g>
                  <g className="bl-pb">
                    <path d="M20 20 L27 22" />
                    <path d="M27 22 L34 18" stroke="#d4a94f" />
                    <path d="M20 20 L14 27" />
                    <path d="M20 32 L26 40 L30 47" />
                    <path d="M20 32 L15 42 L15 50" />
                  </g>
                </g>
                <g className="bl-c-aim">
                  <path d="M20 20 L32 20" />
                  <path d="M32 20 h7" stroke="#d4a94f" strokeWidth="3.6" />
                  <path d="M33.5 21.5 v4" stroke="#d4a94f" strokeWidth="2.4" />
                  <path d="M20 21 L15 27" />
                  <path d="M20 32 L14 50" />
                  <path d="M20 32 L27 50" />
                </g>
                <g className="bl-c-stand">
                  <path d="M20 20 L15 30" />
                  <path d="M20 20 L25 30" />
                  <path d="M20 32 L15 50" />
                  <path d="M20 32 L25 50" />
                </g>
              </svg>
            </div>

            <div className="bl-flash" />
            <div className="bl-bullet" />
            <div className="bl-dor">DOR!</div>
            <div className="bl-floor" />
          </div>

          <div className="bl-curtain-l" aria-hidden="true" />
          <div className="bl-curtain-r" aria-hidden="true" />
          <div className="bl-tamat" aria-hidden="true">
            Tamat
          </div>
        </div>

        <div
          className="bl-bar"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span style={{ width: `${progress}%` }} />
        </div>
        <p className="bl-text">Memuat…</p>
      </div>
    </div>
  );
}

/** Menu akun: tiga garis di pojok kanan header, berisi profil singkat & Logout. */
function AccountMenu({ onLogout }: { onLogout: () => void }) {
  const p = personnel;
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <div className="pt-menu" ref={boxRef}>
        <button
          ref={btnRef}
          type="button"
          className="pt-menu-btn"
          aria-label="Menu akun"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <MenuDotsIcon size={22} />
        </button>
        {open && (
          <div className="pt-menu-dd" role="menu">
            <div className="pt-menu-who">
              <div className="pt-avatar" aria-hidden="true">
                <Avatar url={p.avatarUrl} name={p.name} />
              </div>
              <div>
                <strong>{p.name}</strong>
                <span>
                  {p.rank} &middot; {p.unit}
                </span>
              </div>
            </div>
            <button
              type="button"
              role="menuitem"
              className="pt-menu-item pt-menu-danger"
              onClick={() => {
                setOpen(false);
                setConfirm(true);
              }}
            >
              <LogOutIcon size={18} />
              <span>Logout</span>
            </button>
          </div>
        )}
      </div>

      {confirm && (
        <div className="pt-dialog-wrap" role="presentation" onClick={() => setConfirm(false)}>
          <div
            className="pt-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="logout-title"
            aria-describedby="logout-desc"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="logout-title">Keluar dari akun?</h2>
            <p id="logout-desc">Kamu harus login Discord lagi untuk membuka aplikasi.</p>
            <div className="pt-dialog-actions">
              <button type="button" className="pt-dialog-btn" onClick={() => setConfirm(false)}>
                Batal
              </button>
              <button
                type="button"
                className="pt-dialog-btn pt-dialog-danger"
                onClick={() => {
                  setConfirm(false);
                  onLogout();
                }}
              >
                Keluar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Layar login: aplikasi hanya terbuka setelah login Discord. */
function LoginGate({ loading, onLogin }: { loading: boolean; onLogin: () => void }) {
  const [help, setHelp] = useState(false);
  return (
    <div className="pt-shell">
      <main className="pt-main" style={{ paddingTop: "8vh" }}>
        <section className="pt-card pt-form-card" style={{ textAlign: "center" }}>
          {/* Simpan gambar di folder public/ dengan nama discord-login.jpg */}
          <img
            src="/discord-login.jpg"
            alt="Discord"
            width={96}
            height={96}
            style={{ display: "block", margin: "0 auto", borderRadius: 24 }}
          />
          <h2 className="pt-form-title" style={{ marginTop: 14 }}>
            HIGH STATE PD
          </h2>
          <p className="pt-muted" style={{ marginTop: 6 }}>
            Masuk dengan akun Discord untuk membuka Personnel Terminal.
          </p>

          <div
            role="alert"
            style={{
              marginTop: 16,
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid var(--red)",
              background: "rgba(239,68,68,0.12)",
              color: "#fca5a5",
              fontSize: 13,
              fontWeight: 700,
              lineHeight: 1.4,
            }}
          >
            Selain dari anggota kepolisian dilarang mengakses web ini!
          </div>

          {loading ? (
            <p className="pt-muted" style={{ marginTop: 18 }}>
              Memeriksa sesi login…
            </p>
          ) : (
            <button
              type="button"
              className="pt-submit"
              style={{ marginTop: 18, width: "100%", background: "#5865F2" }}
              onClick={onLogin}
            >
              Login dengan Discord
            </button>
          )}

          <button
            type="button"
            aria-expanded={help}
            onClick={() => setHelp((v) => !v)}
            style={{
              marginTop: 14,
              background: "none",
              border: 0,
              padding: 6,
              color: "var(--muted)",
              fontSize: 13,
              fontWeight: 600,
              textDecoration: "underline",
              cursor: "pointer",
            }}
          >
            Ada kendala saat login?
          </button>

          {help && (
            <ul
              className="pt-muted"
              style={{ margin: "8px 0 0", paddingLeft: 18, textAlign: "left", lineHeight: 1.6 }}
            >
              <li>Pastikan akun Discord kamu sudah bergabung di server kepolisian.</li>
              <li>Buka web lewat Chrome atau Safari, bukan browser di dalam aplikasi lain.</li>
              <li>Saat halaman Discord muncul, ketuk Izinkan (Authorize).</li>
              <li>Tutup tab, buka lagi, lalu coba login ulang.</li>
              <li>Masih gagal? Hubungi admin atau atasan kamu.</li>
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

export default function PersonnelTerminal() {
  // Salinan data personil sebagai state React — perubahan di sini memicu render ulang
  // seluruh layar (nama/pangkat/devisi ikut berubah otomatis setelah login Discord).
  const [profile, setProfile] = useState<PersonnelData>(() => ({ ...personnel }));
  const syncId = useRef(0);
  const refreshTokenRef = useRef<string | undefined>(undefined);
  const refreshingRef = useRef(false); // cegah dua panggilan /api/discord-refresh bertabrakan
  // Status login: "loading" = cek sesi, "out" = belum login, "in" = sudah login Discord
  const [authState, setAuthState] = useState<"loading" | "out" | "in">("loading");

  /** Terapkan data personil ke variabel global + state supaya UI ter-update. */
  const applyPersonnel = (data: Partial<PersonnelData>) => {
    setPersonnelData(data);
    setProfile({ ...personnel });
  };

  /**
   * Ambil nama/foto/pangkat/devisi dari sesi Supabase (Discord OAuth2).
   * Dipanggil saat halaman dibuka dan setiap kali status login berubah.
   */
  const syncFromSession = async (session: Session | null) => {
    const myId = ++syncId.current; // abaikan hasil sync lama jika ada sync baru
    const user = session?.user;

    // Belum login -> kembali ke data default
    if (!user) {
      clearDiscordProfile();
      resetPersonnelData();
      setProfile({ ...personnel });
      setAuthState("out");
      return;
    }
    setAuthState("in");

    const meta = (user.user_metadata ?? {}) as {
      full_name?: string;
      name?: string;
      custom_claims?: { global_name?: string };
      avatar_url?: string;
    };
    // Nilai bawaan dari Supabase (bisa berupa snapshot lama, mis. avatar_url beku
    // sejak login pertama kali) - dipakai hanya sebagai cadangan awal sebelum data
    // langsung dari Discord datang.
    let name =
      meta.custom_claims?.global_name || meta.full_name || meta.name || "Personil";
    let avatarUrl = meta.avatar_url || "";
    const providerToken = session?.provider_token;
    // Hanya ada sesaat setelah login; dipakai untuk menyegarkan data nanti tanpa login ulang
    const providerRefreshToken = (session as unknown as { provider_refresh_token?: string })
      ?.provider_refresh_token;

    // Token Discord tidak tersedia (mis. setelah refresh halaman) -> pakai cache terakhir,
    // lalu coba segarkan diam-diam dari Discord di belakang layar
    if (!providerToken) {
      const cached = loadDiscordProfile(user.id);
      applyPersonnel({
        name: cached?.name ?? name,
        avatarUrl: cached?.avatarUrl ?? avatarUrl,
        rank: cached?.rank ?? "Login ulang untuk sinkron",
        unit: cached?.unit ?? "-",
        discordLinked: true,
      });
      refreshTokenRef.current = cached?.refreshToken;
      if (cached?.refreshToken) void refreshFromDiscord(user.id, cached.refreshToken);
      return;
    }

    // Tampilkan nama & foto dulu (nilai sementara dari Supabase), lalu buru-buru
    // ganti dengan data LANGSUNG dari Discord supaya foto/nama pasti yang terbaru,
    // bukan snapshot lama Supabase.
    applyPersonnel({ name, avatarUrl, discordLinked: true });

    try {
      const live = await fetchDiscordProfile(providerToken);
      if (live) {
        name = live.name;
        avatarUrl = live.avatarUrl;
        applyPersonnel({ name, avatarUrl, discordLinked: true });
      }
    } catch {
      /* gagal ambil profil langsung -> tetap pakai nilai bawaan Supabase di atas */
    }

    let rank = "Bukan anggota server";
    let unit = "-";
    try {
      const roles = await fetchDiscordGuildRoles(providerToken);
      if (roles) ({ rank, unit } = mapRolesToPangkatDivisi(roles));
    } catch {
      /* gagal ambil role -> tetap tampil nilai bawaan di atas */
    }
    if (myId !== syncId.current) return; // sudah ada sync yang lebih baru

    applyPersonnel({ name, avatarUrl, rank, unit, discordLinked: true });
    refreshTokenRef.current = providerRefreshToken;
    saveDiscordProfile({
      userId: user.id,
      name,
      avatarUrl,
      rank,
      unit,
      refreshToken: providerRefreshToken,
    });
  };

  /**
   * Minta data terbaru langsung dari Discord (nama, foto, pangkat, devisi) lewat
   * route /api/discord-refresh, tanpa perlu logout/login ulang. Gagal diam-diam:
   * kalau route belum disiapkan atau token kedaluwarsa, data cache lama tetap dipakai.
   */
  const refreshFromDiscord = async (userId: string, refreshToken: string): Promise<boolean> => {
    if (refreshingRef.current) return false; // sudah ada permintaan penyegaran yang sedang berjalan
    if (!tryAcquireRefreshLock()) return false; // tab lain baru saja mencoba menyegarkan
    refreshingRef.current = true;
    try {
      const res = await fetch("/api/discord-refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return false;
      const data = (await res.json()) as {
        name?: string;
        avatarUrl?: string;
        rank?: string;
        unit?: string;
        refreshToken?: string;
      };
      if (!data.name) return false;
      applyPersonnel({
        name: data.name,
        avatarUrl: data.avatarUrl ?? "",
        rank: data.rank ?? "-",
        unit: data.unit ?? "-",
        discordLinked: true,
      });
      const nextRefreshToken = data.refreshToken ?? refreshToken;
      refreshTokenRef.current = nextRefreshToken;
      saveDiscordProfile({
        userId,
        name: data.name,
        avatarUrl: data.avatarUrl ?? "",
        rank: data.rank ?? "-",
        unit: data.unit ?? "-",
        refreshToken: nextRefreshToken,
      });
      return true;
    } catch {
      /* offline / route belum ada -> abaikan, tetap pakai data cache */
      return false;
    } finally {
      refreshingRef.current = false;
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => syncFromSession(data.session));
    // Pakai session dari callback (bukan getSession lagi) supaya provider_token ikut terbaca
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      syncFromSession(session);
    });
    // Setiap kali tab ini dibuka/aktif lagi, coba segarkan foto/nama/pangkat dari Discord.
    // Selalu ambil kunci TERBARU dari localStorage (bukan dari ingatan tab ini saja),
    // supaya kalau tab lain sudah lebih dulu memperbarui kunci, tab ini ikut memakai
    // yang terbaru - bukan kunci lama yang sudah tidak berlaku.
    const onFocus = () => {
      supabase.auth.getSession().then(({ data }) => {
        const userId = data.session?.user?.id;
        if (!userId) return;
        const latest = loadDiscordProfile(userId)?.refreshToken ?? refreshTokenRef.current;
        if (latest) void refreshFromDiscord(userId, latest);
      });
    };
    window.addEventListener("focus", onFocus);
    const onVisible = () => {
      if (document.visibilityState === "visible") onFocus();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      listener.subscription.unsubscribe();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDiscordLogin = () => {
    supabase.auth.signInWithOAuth({
      provider: "discord",
      options: {
        scopes: "identify guilds.members.read",
        redirectTo: window.location.origin,
      },
    });
  };

  const handleDiscordLogout = async () => {
    await supabase.auth.signOut(); // onAuthStateChange akan mereset data ke default
  };


  const [nav, setNav] = useState<{ screen: Screen; dir: Dir }>({
    screen: "home",
    dir: "fade",
  });
  const screen = nav.screen;

  // Draft form absensi disimpan di sini supaya isinya tidak hilang saat pindah halaman
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  // Log: laporan/absensi yang sudah dikirim (dipulihkan dari localStorage)
  const [logs, setLogs] = useState<LogEntry[]>(loadLogs);
  useEffect(() => saveLogs(logs), [logs]);
  const upsertLog = (entry: LogEntry) =>
    setLogs((ls) => [entry, ...ls.filter((l) => l.id !== entry.id)].slice(0, MAX_LOGS));
  const removeLog = (id: number) => setLogs((ls) => ls.filter((l) => l.id !== id));

  // Admin: PIN + daftar akses tersimpan di localStorage; status login hanya berlaku selama sesi ini.
  const [adminAuth, setAdminAuth] = useState<AdminAuth | null>(loadAdminAuth);
  useEffect(() => {
    if (adminAuth) saveAdminAuth(adminAuth);
  }, [adminAuth]);
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [adminUser, setAdminUser] = useState<string | null>(null);

  const setupAdminPin = (pin: string) => {
    setAdminAuth({ pin, access: [] });
    setAdminUnlocked(true);
    setAdminUser(personnel.name);
  };
  const loginAdmin = (name: string, pin: string) => {
    if (!adminAuth || adminAuth.pin !== pin || !isNameAuthorized(adminAuth, name)) return false;
    setAdminUnlocked(true);
    setAdminUser(name.trim());
    return true;
  };
  const logoutAdmin = () => {
    setAdminUnlocked(false);
    setAdminUser(null);
  };
  const addAdminAccess = (name: string) =>
    setAdminAuth((a) =>
      a
        ? {
            ...a,
            access: [...a.access.filter((x) => x.name.toLowerCase() !== name.toLowerCase()), { name }],
          }
        : a
    );
  const removeAdminAccess = (name: string) =>
    setAdminAuth((a) =>
      a ? { ...a, access: a.access.filter((x) => x.name.toLowerCase() !== name.toLowerCase()) } : a
    );
  const changeAdminPin = (oldPin: string, newPin: string) => {
    if (!adminAuth || adminAuth.pin !== oldPin) return false;
    setAdminAuth({ ...adminAuth, pin: newPin });
    return true;
  };
  const decideLog = (id: number, status: "approved" | "rejected") =>
    setLogs((ls) =>
      ls.map((l) => (l.id === id ? { ...l, status, decidedBy: adminUser ?? undefined, decidedAt: Date.now() } : l))
    );

  const [cutiDraft, setCutiDraft] = useState<CutiDraft>(emptyCuti);
  const [evidence, setEvidence] = useState<EvidenceDraft>(emptyEvidence);
  const [cellDraft, setCellDraft] = useState<CellDraft>(emptyCellDraft);
  const cellRef = useRef(cellDraft);
  cellRef.current = cellDraft;
  const [tilangDraft, setTilangDraft] = useState<TilangDraft>(emptyTilang);
  const tilangRef = useRef(tilangDraft);
  tilangRef.current = tilangDraft;
  const [impoundDraft, setImpoundDraft] = useState<ImpoundDraft>(emptyImpound);
  const impoundRef = useRef(impoundDraft);
  impoundRef.current = impoundDraft;
  const evidenceRef = useRef(evidence);
  evidenceRef.current = evidence;
  useEffect(
    () => () => {
      draftRef.current.photos.forEach((ph) => ph && URL.revokeObjectURL(ph.url));
      evidenceRef.current.photos.forEach((ph) => URL.revokeObjectURL(ph.url));
      cellRef.current.photos.forEach((ph) => URL.revokeObjectURL(ph.url));
      tilangRef.current.photos.forEach((ph) => URL.revokeObjectURL(ph.url));
      impoundRef.current.photos.forEach((ph) => URL.revokeObjectURL(ph.url));
    },
    []
  );

  // Nama petugas di semua form ikut berubah otomatis saat login/logout Discord
  // (form yang sudah terkirim tidak diubah).
  useEffect(() => {
    const name = profile.name;
    setDraft((d) => (d.submitted || d.name === name ? d : { ...d, name }));
    setCutiDraft((d) => (d.submitted || d.name === name ? d : { ...d, name }));
    setEvidence((d) => (d.submitted || d.name === name ? d : { ...d, name }));
    setCellDraft((d) => (d.submitted || d.name === name ? d : { ...d, name }));
    setTilangDraft((d) => (d.submitted || d.name === name ? d : { ...d, name }));
    setImpoundDraft((d) => (d.submitted || d.name === name ? d : { ...d, name }));
  }, [profile.name]);

  const commitScreen = (next: Screen) =>
    setNav((prev) => {
      if (prev.screen === next) return prev;
      const dir: Dir =
        depth(next) > depth(prev.screen)
          ? "forward"
          : depth(next) < depth(prev.screen)
          ? "back"
          : "fade";
      return { screen: next, dir };
    });

  // Layar loading: logo + bar persen + tulisan berganti-ganti.
  // Dipakai saat aplikasi dibuka DAN setiap kali pindah halaman.
  const reduced = prefersReducedMotion();
  const [phase, setPhase] = useState<Boot>(reduced ? "done" : "scan");
  const [appReady, setAppReady] = useState(reduced);
  const [run, setRun] = useState(0);
  const [fast, setFast] = useState(false);
  const [label, setLabel] = useState("");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  const play = (isFast: boolean, text: string, onSwap?: () => void) => {
    clearTimers();
    const t = isFast ? TIMING.nav : TIMING.boot;
    setFast(isFast);
    setLabel(text);
    setRun((n) => n + 1);
    setPhase("scan");
    timers.current = [
      setTimeout(() => setPhase("ok"), t.ok),
      setTimeout(() => {
        onSwap?.(); // ganti halaman saat layar pembuka mulai memudar
        setAppReady(true);
        setPhase("out");
      }, t.out),
      setTimeout(() => setPhase("done"), t.done),
    ];
  };

  useEffect(() => {
    if (!reduced) play(false, "");
    return clearTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setScreen = (next: Screen) => {
    if (next === screen) return;
    if (phase !== "done" && phase !== "out") return; // abaikan tap saat sedang memuat
    if (prefersReducedMotion()) {
      commitScreen(next);
      return;
    }
    play(true, `Membuka ${next === "home" ? "Home" : screenTitle[next]}…`, () => commitScreen(next));
  };

  const isDetail =
    screen === "absensi" ||
    screen === "absensi-form" ||
    screen === "cuti" ||
    screen === "laporan" ||
    screen === "evidence" ||
    screen === "cell" ||
    screen === "tilang" ||
    screen === "impound";
  // Halaman detail dianggap bagian dari tab Home
  const activeTab: Tab = isDetail ? "home" : (screen as Tab);

  // Layar loading pembuka tampil dulu (juga selama sesi login masih diperiksa)
  const booting = phase !== "done" && !fast;
  if (authState === "loading" || (authState === "out" && booting)) {
    return (
      <div className="pt-root">
        <style>{css}</style>
        <BootLoading phase={phase} />
      </div>
    );
  }

  // Wajib login Discord dulu sebelum bisa membuka aplikasi
  if (authState === "out") {
    return (
      <div className="pt-root">
        <style>{css}</style>
        <LoginGate loading={false} onLogin={handleDiscordLogin} />
      </div>
    );
  }

  return (
    <div className="pt-root">
      <style>{css}</style>

      {phase !== "done" &&
        (fast ? (
          <Splash key={run} phase={phase} fast={fast} label={label} />
        ) : (
          <BootLoading phase={phase} />
        ))}

      {appReady && (
        <div className="pt-shell">
          {screen === "laporan" || screen === "absensi" ? (
            <header className="pt-header pt-header-ops">
              <button
                type="button"
                className="pt-back-sq"
                aria-label="Kembali"
                onClick={() => setScreen("home")}
              >
                <ArrowLeftIcon size={20} />
              </button>
              <div className="pt-ops-head">
                <span className="pt-ops-org">
                  <ShieldCheckIcon size={14} />
                  HIGH STATE PD
                </span>
                <h1 className="pt-ops-title">{screen === "laporan" ? "Laporan Ops" : "Absensi Ops"}</h1>
              </div>
              <AccountMenu onLogout={handleDiscordLogout} />
            </header>
          ) : (
            <header className="pt-header">
              <div className="pt-header-bar">
                {isDetail ? (
                  <button
                    type="button"
                    className="pt-back"
                    onClick={() => setScreen(parentScreen(screen))}
                  >
                    <ChevronLeft size={22} />
                    <span className="pt-title">{screenTitle[screen]}</span>
                  </button>
                ) : (
                  <span className="pt-title">{screenTitle[screen]}</span>
                )}
                <AccountMenu onLogout={handleDiscordLogout} />
              </div>
            </header>
          )}

          <main className="pt-main">
            <div key={screen} className={`pt-page pt-page-${nav.dir}`}>
              {screen === "home" && (
                <HomeScreen
                  onNavigate={setScreen}
                  stagger={nav.dir === "fade"}
                  onDiscordLogin={handleDiscordLogin}
                  onDiscordLogout={handleDiscordLogout}
                />
              )}
              {screen === "log" && <LogScreen logs={logs} onRemove={removeLog} />}
              {screen === "admin" && (
                <AdminScreen
                  auth={adminAuth}
                  unlocked={adminUnlocked}
                  loggedInAs={adminUser}
                  onSetupPin={setupAdminPin}
                  onLogin={loginAdmin}
                  onLogout={logoutAdmin}
                  onAddAccess={addAdminAccess}
                  onRemoveAccess={removeAdminAccess}
                  onChangePin={changeAdminPin}
                  logs={logs}
                  onDecide={decideLog}
                />
              )}
              {screen === "absensi" && <AbsensiMenuScreen onNavigate={setScreen} />}
              {screen === "absensi-form" && (
                <AbsensiForm draft={draft} setDraft={setDraft} onLog={upsertLog} />
              )}
              {screen === "cuti" && <CutiScreen state={cutiDraft} setState={setCutiDraft} onLog={upsertLog} />}
              {screen === "laporan" && <LaporanScreen onNavigate={setScreen} />}
              {screen === "evidence" && (
                <EvidenceScreen state={evidence} setState={setEvidence} onLog={upsertLog} />
              )}
              {screen === "cell" && <CellScreen state={cellDraft} setState={setCellDraft} onLog={upsertLog} />}
              {screen === "tilang" && <TilangScreen state={tilangDraft} setState={setTilangDraft} onLog={upsertLog} />}
              {screen === "impound" && <ImpoundScreen state={impoundDraft} setState={setImpoundDraft} onLog={upsertLog} />}
            </div>
          </main>

          <nav className="pt-nav" aria-label="Navigasi utama">
            {tabs.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                className={`pt-tab ${activeTab === id ? "is-active" : ""}`}
                aria-current={activeTab === id ? "page" : undefined}
                onClick={() => setScreen(id)}
              >
                <Icon size={22} />
                <span>{label}</span>
              </button>
            ))}
          </nav>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Styling                                                             */
/* ------------------------------------------------------------------ */
const css = `
@import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap");

.pt-root {
  --bg: #100e0a;
  --card: #1b1812;
  --card-2: #262118;
  --line: #e0a526; /* warna semua garis / border */
  --line-hi: #f5c842; /* garis saat ditekan / fokus */
  --text: #fbf5e6;
  --muted: #b5a785;
  --blue: #3b82f6;
  --green: #10d9a0;
  --red: #ef4444;
  --deco: #2b2519;

  min-height: 100vh;
  min-height: 100dvh;
  background: #070603;
  color: var(--text);
  font-family: "Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  -webkit-font-smoothing: antialiased;
  display: flex;
  justify-content: center;
}
.pt-root *, .pt-root *::before, .pt-root *::after { box-sizing: border-box; }
.pt-root p, .pt-root h1, .pt-root h2 { margin: 0; }

.pt-shell {
  position: relative;
  width: 100%;
  max-width: 480px;
  min-height: 100vh;
  min-height: 100dvh;
  background: var(--bg);
  display: flex;
  flex-direction: column;
}

/* Header */
.pt-header {
  position: sticky; top: 0; z-index: 5;
  padding: calc(12px + env(safe-area-inset-top, 0px)) 16px 8px;
  background: var(--bg);
}
.pt-header-bar {
  display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 52px; padding: 0 12px 0 18px;
  border-radius: 22px; background: var(--card); border: 1px solid var(--line);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
}
.pt-title { font-size: 15px; font-weight: 700; letter-spacing: 0.06em; }
.pt-avatar {
  width: 48px; height: 48px; border-radius: 50%; flex: none;
  background: #b91c1c; border: 2px solid var(--line);
  display: grid; place-items: center; overflow: hidden;
  font-weight: 700; font-size: 16px;
}
.pt-avatar img { width: 100%; height: 100%; object-fit: cover; }
.pt-idcard { display: flex; align-items: center; gap: 8px; }
.pt-idcard .pt-id3 { flex: 1; min-width: 0; }

.pt-back {
  appearance: none; border: 0; background: transparent; cursor: pointer;
  display: inline-flex; align-items: center; gap: 6px;
  margin: 0 0 0 -10px; padding: 6px 8px; border-radius: 14px;
  color: var(--text); font: inherit;
}
.pt-back:focus-visible { outline: 2px solid var(--line-hi); outline-offset: 2px; }

/* Kartu yang bisa diklik */
.pt-link {
  appearance: none; width: 100%; display: block;
  text-align: left; color: inherit; font: inherit; cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: transform 0.15s ease, border-color 0.15s ease;
}
.pt-link:active { transform: scale(0.97); border-color: var(--line-hi); }
.pt-link:focus-visible { outline: 2px solid var(--line-hi); outline-offset: 3px; }

/* Animasi */
.pt-main { overflow-x: clip; }

.pt-page { animation-duration: 0.35s; animation-timing-function: cubic-bezier(0.22, 1, 0.36, 1); animation-fill-mode: backwards; }
.pt-page-forward { animation-name: pt-in-right; }
.pt-page-back { animation-name: pt-in-left; }
.pt-page-fade { animation-name: pt-fade; animation-duration: 0.25s; }

@keyframes pt-in-right { from { opacity: 0; transform: translateX(32px); } to { opacity: 1; transform: none; } }
@keyframes pt-in-left { from { opacity: 0; transform: translateX(-32px); } to { opacity: 1; transform: none; } }
@keyframes pt-fade { from { opacity: 0; } to { opacity: 1; } }

.pt-rise {
  animation: pt-rise 0.6s cubic-bezier(0.22, 1, 0.36, 1) backwards;
  animation-delay: calc(var(--i, 0) * 90ms);
}
@keyframes pt-rise { from { opacity: 0; transform: translateY(22px); } to { opacity: 1; transform: none; } }

/* Layar loading */
.pt-splash {
  position: fixed; inset: 0; z-index: 50; padding: 24px;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  background: radial-gradient(70% 55% at 50% 38%, #1e1a10 0%, var(--bg) 70%);
  transition: opacity 0.5s ease;
}
.pt-splash.is-out { opacity: 0; pointer-events: none; }
.pt-splash.is-fast { animation: pt-fade 0.15s ease backwards; }

.pt-logo-wrap {
  position: relative; width: min(38vw, 148px); aspect-ratio: 1;
  animation: pt-logo-in 0.7s cubic-bezier(0.22, 1, 0.36, 1) backwards;
}
.pt-logo-wrap::before {
  content: ""; position: absolute; inset: -22%; border-radius: 50%;
  background: radial-gradient(circle, rgba(224, 165, 38, 0.22) 0%, transparent 65%);
  animation: pt-glow 3s ease-in-out infinite;
}
.pt-logo {
  position: relative; display: block; width: 100%; height: 100%; object-fit: contain;
  filter: drop-shadow(0 8px 18px rgba(0, 0, 0, 0.6)); user-select: none;
}

.pt-loadbar { display: flex; align-items: center; gap: 10px; width: min(58vw, 210px); margin-top: 26px; }
.pt-loadtrack {
  flex: 1; height: 6px; border-radius: 99px; overflow: hidden;
  background: #2b2519; box-shadow: inset 0 0 0 1px rgba(224, 165, 38, 0.45);
}
.pt-loadfill {
  height: 100%; border-radius: inherit;
  background: linear-gradient(90deg, #d9622b 0%, #e0a526 55%, #f3d98b 100%);
  box-shadow: 0 0 12px rgba(224, 165, 38, 0.55);
  transition: width 0.12s linear;
}
.pt-loadpct {
  width: 36px; text-align: right; font-size: 12px; font-weight: 700;
  color: #f0c96a; font-variant-numeric: tabular-nums;
}
.pt-loadtext {
  margin-top: 14px !important; min-height: 16px; text-align: center;
  font-size: 10.5px; font-weight: 600; letter-spacing: 0.14em; color: #d9c9a0;
  animation: pt-text-in 0.4s ease backwards;
}

@keyframes pt-logo-in { from { opacity: 0; transform: scale(0.88); } to { opacity: 1; transform: none; } }
@keyframes pt-glow { 0%, 100% { opacity: 0.6; transform: scale(0.96); } 50% { opacity: 1; transform: scale(1.04); } }
@keyframes pt-text-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }

/* Main */
.pt-main { flex: 1; padding: 12px 16px 110px; }
.pt-stack { display: flex; flex-direction: column; gap: 14px; }

.pt-card {
  position: relative; overflow: hidden;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 28px;
  padding: 20px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
}
.pt-deco { position: absolute; color: var(--deco); pointer-events: none; }
.pt-muted { color: var(--muted); font-size: 13px; font-weight: 500; }
.pt-blue { color: var(--blue); }

/* Profil */
.pt-profile {
  display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto;
  align-items: stretch; padding: 12px;
}
.pt-profile .pt-avatar { align-self: center; margin-right: 10px; }
.pt-discord-link {
  grid-column: 1 / -1; margin-top: 10px; text-align: center;
  padding: 8px; border-radius: 12px; font-size: 12.5px; font-weight: 700;
  text-decoration: none; color: #fff; background: #5865F2;
  border: 0; appearance: none; cursor: pointer; font: inherit; width: 100%;
}
.pt-discord-link:hover { filter: brightness(1.08); }
/* Setiap kolom diberi garis pemisah di kiri, tingginya sama rata */
.pt-pf {
  min-width: 0; display: flex; flex-direction: column; justify-content: center; gap: 2px;
  padding: 2px 8px; border-left: 1px solid var(--line);
}
.pt-pf:last-child { padding-right: 0; }
.pt-pf span { font-size: 10px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); }
.pt-pf strong { font-size: 12px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pt-pf em { font-style: normal; font-size: 10px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* Kartu identitas ringkas Nama/Pangkat/Devisi di dalam form laporan */
.pt-id3 {
  display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px;
  padding: 16px 18px; border-radius: 20px; background: #221e16; border: 1px solid var(--line);
}
.pt-id3 > div { min-width: 0; display: flex; flex-direction: column; gap: 4px; padding-left: 10px; border-left: 1px solid var(--line); }
.pt-id3 > div:first-child { padding-left: 0; border-left: 0; }
.pt-id3 span { font-size: 11px; font-weight: 700; letter-spacing: 0.09em; text-transform: uppercase; color: var(--muted); }
.pt-id3 strong { font-size: 15px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* Stats */
.pt-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.pt-stat { padding: 16px 18px; border-radius: 26px; }
.pt-deco-stat { right: 10px; top: 10px; opacity: 0.9; }
.pt-icon-circle {
  position: relative; width: 44px; height: 44px; border-radius: 50%;
  display: grid; place-items: center; margin-bottom: 18px;
}
.pt-icon-blue { background: #172443; color: var(--blue); }
.pt-icon-green { background: #0f2b25; color: var(--green); }
.pt-stat-title { position: relative; font-size: 16px; font-weight: 700; letter-spacing: -0.3px; }
.pt-unit { margin-left: 8px; font-size: 20px; font-weight: 400; letter-spacing: 0; color: #e3d8b9; }

/* Kartu besar */
.pt-rank {
  position: relative; margin-top: 10px !important;
  font-size: 38px; font-weight: 800; letter-spacing: -1px; line-height: 1.1;
}
/* Absen minggu ini */
.pt-week { padding: 20px 16px 18px; }
.pt-deco-week { width: 110px; right: -10px; top: 8px; }
.pt-week .pt-muted { position: relative; }
.pt-week-range { font-size: 23px; }
.pt-week-range .pt-unit { font-size: 15px; margin-left: 8px; color: var(--muted); }

.pt-days {
  position: relative; list-style: none; margin: 16px 0 0; padding: 0;
  display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px;
}
.pt-day {
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  padding: 10px 0 11px; border-radius: 16px;
  background: #221e16; border: 1px solid var(--line);
}
.pt-day-name { font-size: 10px; font-weight: 500; color: var(--muted); }
.pt-day-num { font-size: 15px; font-weight: 700; line-height: 1.2; }
.pt-day-dot { width: 6px; height: 6px; margin-top: 4px; border-radius: 50%; background: transparent; }
.pt-day.is-hadir { background: #0f2b25; }
.pt-day.is-hadir .pt-day-dot { background: var(--green); }
.pt-day.is-absen .pt-day-dot { background: var(--red); }
.pt-day.is-nanti { opacity: 0.45; }
.pt-day.is-today { border-color: var(--line-hi); box-shadow: inset 0 0 0 1px var(--line-hi); }
.pt-day.is-today.is-belum { background: #172443; }

.pt-week .pt-progress-foot { font-size: 12px; justify-content: flex-start; gap: 18px; flex-wrap: wrap; }
.pt-legend { display: inline-flex; align-items: center; gap: 8px; }
.pt-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.pt-dot.is-hadir { background: var(--green); }
.pt-dot.is-absen { background: var(--red); }
.pt-dot.is-today { background: transparent; border: 2px solid var(--line-hi); width: 10px; height: 10px; }

.pt-progress-block { position: relative; margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--line); }
.pt-progress-head { display: flex; align-items: center; justify-content: space-between; font-size: 14px; font-weight: 500; }
.pt-progress-head span { display: inline-flex; align-items: center; gap: 10px; }
.pt-progress-head strong { font-size: 14px; font-weight: 700; }
.pt-bar {
  margin-top: 12px; height: 14px; padding: 2px;
  background: #2b2519; border: 1px solid var(--line); border-radius: 999px;
}
.pt-bar-fill {
  height: 100%; border-radius: 999px;
  background: linear-gradient(90deg, #2563eb 0%, #6366f1 45%, #06b6d4 100%);
  transition: width 0.8s cubic-bezier(0.22, 1, 0.36, 1);
}
.pt-progress-foot {
  margin-top: 14px; display: flex; justify-content: space-between; gap: 12px;
  color: var(--muted); font-size: 13px;
}
.pt-progress-foot b { color: var(--text); font-weight: 600; }

/* Form absensi */
.pt-form-card { padding: 28px 24px; }
.pt-form-title { overflow-wrap: anywhere; margin-top: 6px !important; font-size: 24px; font-weight: 800; letter-spacing: -0.5px; line-height: 1.15; }
.pt-form { display: flex; flex-direction: column; gap: 26px; margin-top: 28px; }
.pt-field { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.pt-field > span {
  font-size: 12px; font-weight: 700; letter-spacing: 0.09em; text-transform: uppercase;
  color: var(--muted);
}
.pt-field small { font-size: 12px; color: var(--muted); }
.pt-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.pt-input {
  width: 100%; min-width: 0; min-height: 54px; padding: 13px 16px;
  border-radius: 20px; background: #221e16; border: 1px solid var(--line);
  color: var(--text); font: inherit; font-size: 16px; color-scheme: dark;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.pt-input::placeholder { color: #857a59; }
.pt-input:focus { outline: none; border-color: var(--line-hi); box-shadow: 0 0 0 3px rgba(245, 200, 66, 0.28); }
 .pt-textarea { min-height: 130px; resize: vertical; line-height: 1.5; }
.pt-readonly { display: flex; align-items: center; gap: 10px; color: #857a59; font-size: 16px; }
.pt-readonly.has-value { color: var(--green); font-weight: 600; background: #0f2b25; font-size: 17px; }

.pt-photos-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
 .pt-form-sub { font-size: 18px; font-weight: 700; }
.pt-photos-head .pt-muted { margin-top: 6px !important; font-size: 14px; line-height: 1.45; }
.pt-photos-head strong { font-size: 18px; color: var(--blue); white-space: nowrap; }
.pt-photos { display: grid; grid-template-columns: 1fr 1fr; gap: 18px 14px; margin-top: 22px; }
.pt-photo {
  position: relative; aspect-ratio: 1; border-radius: 24px; overflow: hidden;
  background: #221e16; border: 1.5px dashed var(--line);
}
.pt-photo.is-filled { border: 1.5px solid var(--line); }
.pt-photo:focus-within { outline: 2px solid var(--line-hi); outline-offset: 2px; }
.pt-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
.pt-photo-empty {
  position: absolute; inset: 0; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 8px;
  color: var(--muted); font-size: 14px; cursor: pointer;
}
.pt-photo-empty input { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; }
.pt-photo-num {
  position: absolute; top: 10px; left: 10px; width: 26px; height: 26px; border-radius: 50%;
  background: rgba(0, 0, 0, 0.6); display: grid; place-items: center;
  font-size: 13px; font-weight: 700; pointer-events: none;
}
.pt-photo-x {
  position: absolute; top: 8px; right: 8px; width: 34px; height: 34px; border-radius: 50%;
  border: 0; background: rgba(0, 0, 0, 0.65); color: #fff;
  display: grid; place-items: center; cursor: pointer;
}
.pt-photo-title { margin-top: 10px !important; font-size: 15px; font-weight: 600; }
.pt-photo-hint { margin-top: 2px !important; font-size: 13px; color: var(--muted); }

.pt-submit, .pt-secondary {
  appearance: none; width: 100%; padding: 18px; border-radius: 22px;
  font: inherit; font-size: 16px; font-weight: 700; letter-spacing: 0.03em; cursor: pointer;
  transition: transform 0.15s ease, opacity 0.2s ease;
}
.pt-submit { border: 0; background: linear-gradient(90deg, #2563eb, #6366f1); color: #fff; }
.pt-submit:disabled { background: #221e16; color: #857a59; border: 1px solid var(--line); cursor: not-allowed; }
.pt-secondary { background: transparent; border: 1px solid var(--line); color: var(--text); font-weight: 600; }
.pt-submit:active:not(:disabled), .pt-secondary:active { transform: scale(0.98); }
.pt-submit:focus-visible, .pt-secondary:focus-visible { outline: 2px solid var(--line-hi); outline-offset: 3px; }
.pt-hint { margin-top: -10px !important; text-align: center; font-size: 14px; color: var(--muted); }

.pt-done-icon {
  width: 60px; height: 60px; border-radius: 50%; margin-bottom: 18px;
  background: #0f2b25; color: var(--green); display: grid; place-items: center;
}
.pt-report {
  margin: 20px 0 0; padding: 18px; border-radius: 20px;
  background: #221e16; border: 1px solid var(--line); color: #ede3c6;
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  font-size: 14px; line-height: 1.6; white-space: pre-wrap; word-break: break-word;
}
.pt-thumbs { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 16px; }
.pt-thumbs img { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 14px; }

/* Menu Laporan (grid kartu) */
.pt-header-ops {
  display: flex; align-items: flex-start; justify-content: space-between; gap: 10px;
  padding: calc(16px + env(safe-area-inset-top, 0px)) 16px 10px;
}
.pt-header-ops .pt-ops-head { flex: 1; }
.pt-back-sq {
  appearance: none; flex: none; width: 40px; height: 40px; border-radius: 13px; cursor: pointer;
  display: grid; place-items: center; color: var(--text);
  background: var(--card); border: 1px solid var(--line);
  transition: transform 0.15s ease;
}
.pt-back-sq:active { transform: scale(0.94); }
.pt-back-sq:focus-visible { outline: 2px solid var(--line-hi); outline-offset: 2px; }
.pt-ops-head { display: flex; flex-direction: column; align-items: flex-end; gap: 3px; }
.pt-ops-org {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 10.5px; font-weight: 700; letter-spacing: 0.14em; color: var(--muted);
}
.pt-ops-org svg { color: #ef4444; }
 .pt-ops-title { font-size: 20px; font-weight: 800; letter-spacing: -0.4px; line-height: 1.15; }

.pt-ops-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding-top: 6px; }
.pt-ops-card {
  appearance: none; display: flex; flex-direction: column; align-items: center; gap: 9px;
  padding: 16px 10px 14px; border-radius: 22px; cursor: pointer;
  background: var(--card); border: 1px solid var(--line);
  color: inherit; font: inherit; box-shadow: 0 10px 26px rgba(0, 0, 0, 0.35);
  transition: transform 0.15s ease, border-color 0.15s ease;
  -webkit-tap-highlight-color: transparent;
}
.pt-ops-card:active { transform: scale(0.97); border-color: var(--line-hi); }
.pt-ops-card:focus-visible { outline: 2px solid var(--line-hi); outline-offset: 3px; }
.pt-ops-ico {
  width: 46px; height: 46px; border-radius: 15px; display: grid; place-items: center;
  background: #221e16; border: 1px solid var(--line); color: #ef3b3b;
}
.pt-ops-name { font-size: 14.5px; font-weight: 600; text-align: center; }
.pt-ops-pill {
  padding: 3px 10px; border-radius: 8px; font-size: 12px; font-weight: 600;
  background: rgba(239, 68, 68, 0.12); border: 1px solid var(--line); color: #ef5350;
}

/* Bukti foto Evidence */
.pt-ev-photos { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.pt-ev-photos .pt-photo { border-radius: 16px; }
.pt-ev-photos .pt-photo-x { top: 6px; right: 6px; width: 30px; height: 30px; }

/* Log */
.pt-seg {
  display: grid; grid-template-columns: 1fr 1fr; gap: 6px; padding: 6px;
  border-radius: 20px; background: var(--card); border: 1px solid var(--line);
}
.pt-seg-btn {
  appearance: none; border: 0; background: transparent; cursor: pointer;
  display: flex; align-items: center; justify-content: center; gap: 8px;
  padding: 11px 8px; border-radius: 15px; color: var(--muted);
  font: inherit; font-size: 14px; font-weight: 600;
  transition: background 0.2s ease, color 0.2s ease;
}
.pt-seg-btn.is-active { background: #2b2519; color: var(--line-hi); }
.pt-seg-btn:focus-visible { outline: 2px solid var(--line-hi); outline-offset: 2px; }
.pt-seg-count {
  min-width: 20px; padding: 1px 6px; border-radius: 99px; font-size: 11px;
  background: rgba(224, 165, 38, 0.16); color: var(--line-hi);
}
.pt-log-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
.pt-log-item { overflow: hidden; border-radius: 22px; background: var(--card); border: 1px solid var(--line); }
.pt-log-head {
  appearance: none; width: 100%; border: 0; background: transparent; color: inherit;
  font: inherit; text-align: left; cursor: pointer;
  display: flex; align-items: center; gap: 12px; padding: 14px;
  -webkit-tap-highlight-color: transparent;
}
.pt-log-head:focus-visible { outline: 2px solid var(--line-hi); outline-offset: -2px; border-radius: 22px; }
.pt-log-ico { flex: none; width: 42px; height: 42px; border-radius: 14px; }
.pt-log-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.pt-log-kind { font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); }
.pt-log-title, .pt-log-sub { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pt-log-title { font-size: 15px; font-weight: 700; }
.pt-log-sub { font-size: 13px; color: #e3d8b9; }
.pt-log-time { font-size: 11.5px; color: var(--muted); }
.pt-log-chev { flex: none; color: var(--muted); transition: transform 0.2s ease; }
.pt-log-item.is-open .pt-log-chev { transform: rotate(180deg); }
.pt-log-body { padding: 0 14px 14px; }
.pt-log-body .pt-report { margin: 0; }
.pt-log-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 12px; }
.pt-log-actions .pt-secondary { padding: 12px; font-size: 15px; border-radius: 16px; }
.pt-secondary.is-danger { color: #ef5350; }
.pt-log-empty { text-align: center; padding: 30px 20px; }
.pt-log-empty-title { font-size: 16px; font-weight: 700; }

/* Extra card */
.pt-extra { border-radius: 36px; padding: 26px 28px; }
.pt-extra-text { margin-top: 8px !important; font-size: 16px; color: #e3d8b9; }

/* Bottom nav */
.pt-nav {
  position: fixed; left: 50%; transform: translateX(-50%); z-index: 10;
  bottom: calc(12px + env(safe-area-inset-bottom, 0px));
  width: calc(100% - 32px); max-width: 448px;
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; padding: 6px;
  background: rgba(27, 24, 18, 0.94); border: 1px solid var(--line); border-radius: 26px;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(10px);
}
 .pt-tab {
  appearance: none; border: 0; background: transparent; cursor: pointer;
  display: flex; align-items: center; justify-content: center; gap: 8px;
  padding: 11px 8px; border-radius: 18px;
  color: #a09371; font: inherit; font-size: 13px; font-weight: 600;
  transition: background 0.2s, color 0.2s;
}
.pt-tab.is-active { background: #221e16; color: var(--red); }
.pt-tab:focus-visible { outline: 2px solid var(--line-hi); outline-offset: 2px; }

/* Admin */
.pt-admin-who { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 18px 20px; }
.pt-admin-who strong { font-size: 17px; }
.pt-access-add { flex: 0 0 auto; padding: 0 18px; }
.pt-access-list { list-style: none; margin: 14px 0 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.pt-access-list li {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 10px 14px; border-radius: 16px; background: #221e16; border: 1px solid var(--line);
  font-size: 14.5px; font-weight: 600;
}
.pt-access-list .pt-photo-x { position: static; width: 26px; height: 26px; flex: none; }
.pt-status-pill {
  flex: none; padding: 3px 10px; border-radius: 8px; font-size: 11.5px; font-weight: 700;
  border: 1px solid var(--line);
}
.pt-status-pill.is-pending { background: rgba(224, 165, 38, 0.16); color: var(--line-hi); }
.pt-status-pill.is-approved { background: rgba(16, 217, 160, 0.16); color: var(--green); }
.pt-status-pill.is-rejected { background: rgba(239, 68, 68, 0.14); color: #ef5350; }

/* Compact typography — dibuat lebih kecil agar tampilan mobile tidak terasa besar */
.pt-root { font-size: 14px; }
.pt-header-bar { min-height: 48px; padding: 0 16px; }
.pt-avatar { width: 44px; height: 44px; font-size: 14px; }
.pt-card { padding: 18px; border-radius: 24px; }
.pt-stat { padding: 14px 16px; border-radius: 22px; }
.pt-icon-circle { width: 40px; height: 40px; margin-bottom: 14px; }
.pt-deco-stat svg { width: 72px; height: 72px; }
.pt-stack { gap: 12px; }
.pt-main { padding: 10px 14px 100px; }
.pt-nav { width: calc(100% - 28px); bottom: calc(10px + env(safe-area-inset-bottom, 0px)); }

/* Compact v2 — perkecil lagi form, tombol, dan kartu laporan */
.pt-form-card { padding: 18px 16px; }
.pt-form-title { font-size: 19px; }
.pt-form { gap: 16px; margin-top: 18px; }
.pt-field { gap: 6px; }
.pt-field > span { font-size: 11px; }
.pt-field small { font-size: 11.5px; }
.pt-input {
  min-height: 46px; padding: 10px 13px;
  border-radius: 14px; font-size: 14.5px;
}
.pt-textarea { min-height: 90px; }
.pt-id3 { padding: 10px 12px; border-radius: 16px; gap: 8px; }
.pt-id3 span { font-size: 9.5px; }
.pt-id3 strong { font-size: 13px; }
.pt-row { gap: 10px; }
.pt-submit, .pt-secondary { padding: 14px; border-radius: 16px; font-size: 15px; }
.pt-photos { gap: 12px 10px; }
.pt-photo { border-radius: 16px; }
.pt-photo-title { font-size: 13px; }
.pt-photo-hint { font-size: 11.5px; }
.pt-log-head { padding: 11px; gap: 10px; }
.pt-log-ico { width: 36px; height: 36px; border-radius: 12px; }
.pt-log-title { font-size: 13.5px; }
.pt-log-sub { font-size: 12px; }
.pt-log-time { font-size: 10.5px; }
.pt-ops-card { padding: 13px 8px 11px; border-radius: 18px; }
.pt-ops-ico { width: 40px; height: 40px; border-radius: 13px; }
.pt-ops-name { font-size: 13px; }

/* Compact v3 — perkecil lagi seluruh tampilan secara global */
.pt-root { font-size: 12px; }
.pt-shell { max-width: 420px; }
.pt-header { padding: calc(8px + env(safe-area-inset-top, 0px)) 12px 6px; }
.pt-header-bar { min-height: 40px; padding: 0 12px; border-radius: 16px; }
.pt-title { font-size: 13px; }
.pt-avatar { width: 34px; height: 34px; font-size: 12px; }
.pt-card { padding: 12px; border-radius: 18px; }
.pt-form-card { padding: 14px 12px; }
.pt-form-title { font-size: 16px; }
.pt-stat { padding: 10px 11px; border-radius: 16px; }
.pt-icon-circle { width: 30px; height: 30px; margin-bottom: 8px; }
.pt-deco-stat svg { width: 54px; height: 54px; }
.pt-stack { gap: 8px; }
.pt-main { padding: 6px 10px 84px; }
.pt-nav {
  width: calc(100% - 20px); bottom: calc(8px + env(safe-area-inset-bottom, 0px));
  padding: 4px; border-radius: 20px;
}
.pt-tab { padding: 8px 6px; border-radius: 14px; font-size: 11px; gap: 5px; }

.pt-form { gap: 12px; margin-top: 14px; }
.pt-field { gap: 5px; }
.pt-field > span { font-size: 10px; }
.pt-field small { font-size: 10.5px; }
.pt-input {
  min-height: 38px; padding: 7px 10px;
  border-radius: 11px; font-size: 13px;
}
.pt-textarea { min-height: 70px; }
.pt-id3 { padding: 7px 9px; border-radius: 12px; gap: 6px; }
.pt-id3 span { font-size: 8.5px; }
.pt-id3 strong { font-size: 11.5px; }
.pt-row { gap: 8px; }
.pt-submit, .pt-secondary { padding: 11px; border-radius: 13px; font-size: 13.5px; }
.pt-photos { gap: 10px 8px; }
.pt-photo { border-radius: 13px; }
.pt-photo-title { font-size: 12px; }
.pt-photo-hint { font-size: 10.5px; }
.pt-photo-num { width: 20px; height: 20px; font-size: 11px; }
.pt-photo-x { width: 28px; height: 28px; }
.pt-log-head { padding: 9px; gap: 8px; }
.pt-log-ico { width: 30px; height: 30px; border-radius: 10px; }
.pt-log-title { font-size: 12.5px; }
.pt-log-sub { font-size: 11px; }
.pt-log-time { font-size: 10px; }
.pt-log-kind { font-size: 9px; }
.pt-ops-card { padding: 10px 7px 9px; border-radius: 15px; gap: 6px; }
.pt-ops-ico { width: 32px; height: 32px; border-radius: 11px; }
.pt-ops-name { font-size: 11.5px; }
.pt-ops-title { font-size: 16px; }
.pt-status-pill { padding: 2px 7px; font-size: 10px; }
.pt-seg-btn { padding: 8px 6px; font-size: 12px; }

/* Compact v4 — perkecil lagi sekali lagi, seluruh tampilan */
.pt-root { font-size: 10.5px; }
.pt-shell { max-width: 360px; }
.pt-header { padding: calc(6px + env(safe-area-inset-top, 0px)) 9px 5px; }
.pt-header-bar { min-height: 34px; padding: 0 9px; border-radius: 13px; }
.pt-title { font-size: 11px; }
.pt-avatar { width: 28px; height: 28px; font-size: 10.5px; }
.pt-card { padding: 9px; border-radius: 15px; }
.pt-form-card { padding: 10px 9px; }
.pt-form-title { font-size: 13.5px; }
.pt-stat { padding: 8px 9px; border-radius: 13px; }
.pt-icon-circle { width: 25px; height: 25px; margin-bottom: 6px; }
.pt-deco-stat svg { width: 44px; height: 44px; }
.pt-stack { gap: 6px; }
.pt-main { padding: 5px 8px 74px; }
.pt-nav {
  width: calc(100% - 16px); bottom: calc(6px + env(safe-area-inset-bottom, 0px));
  padding: 3px; border-radius: 17px;
}
.pt-tab { padding: 6px 5px; border-radius: 11px; font-size: 9.5px; gap: 4px; }

.pt-form { gap: 9px; margin-top: 10px; }
.pt-field { gap: 4px; }
.pt-field > span { font-size: 8.5px; }
.pt-field small { font-size: 9px; }
.pt-input {
  min-height: 32px; padding: 5px 8px;
  border-radius: 9px; font-size: 11.5px;
}
.pt-textarea { min-height: 56px; }
.pt-id3 { padding: 5px 7px; border-radius: 10px; gap: 5px; }
.pt-id3 span { font-size: 7.5px; }
.pt-id3 strong { font-size: 10px; }
.pt-row { gap: 6px; }
.pt-submit, .pt-secondary { padding: 9px; border-radius: 11px; font-size: 11.5px; }
.pt-photos { gap: 8px 6px; }
.pt-photo { border-radius: 11px; }
.pt-photo-title { font-size: 10.5px; }
.pt-photo-hint { font-size: 9px; }
.pt-photo-num { width: 17px; height: 17px; font-size: 9.5px; }
.pt-photo-x { width: 24px; height: 24px; }
.pt-log-head { padding: 7px; gap: 6px; }
.pt-log-ico { width: 26px; height: 26px; border-radius: 9px; }
.pt-log-title { font-size: 11px; }
.pt-log-sub { font-size: 9.5px; }
.pt-log-time { font-size: 8.5px; }
.pt-log-kind { font-size: 8px; }
.pt-ops-card { padding: 8px 6px 7px; border-radius: 13px; gap: 5px; }
.pt-ops-ico { width: 27px; height: 27px; border-radius: 9px; }
.pt-ops-name { font-size: 10px; }
.pt-ops-title { font-size: 13.5px; }
.pt-status-pill { padding: 2px 6px; font-size: 8.5px; }
.pt-seg-btn { padding: 6px 5px; font-size: 10.5px; }

@media (max-width: 380px) {
  .pt-week .pt-progress-foot { font-size: 11px; gap: 12px; }
}

/* Menu akun (tiga garis) */
.pt-menu { position: relative; flex: none; }
.pt-menu-btn {
  appearance: none; width: 40px; height: 40px; display: grid; place-items: center;
  border: 0; border-radius: 14px; background: transparent; color: var(--text); cursor: pointer;
  -webkit-tap-highlight-color: transparent; transition: background 0.15s ease, transform 0.15s ease;
}
.pt-menu-btn:hover { background: rgba(224, 165, 38, 0.1); }
.pt-menu-btn:active { transform: scale(0.92); }
.pt-menu-btn[aria-expanded="true"] { background: rgba(224, 165, 38, 0.16); }
.pt-menu-btn:focus-visible { outline: 2px solid var(--line-hi); outline-offset: 2px; }
.pt-menu-dd {
  position: absolute; right: 0; top: calc(100% + 8px); z-index: 20;
  width: min(280px, calc(100vw - 32px));
  background: var(--card-hi, #26211a); border: 1px solid var(--line); border-radius: 16px;
  box-shadow: 0 14px 34px rgba(0, 0, 0, 0.55); padding: 8px;
  transform-origin: top right; animation: pt-menu-pop 0.16s ease-out;
}
@keyframes pt-menu-pop { from { opacity: 0; transform: scale(0.94); } to { opacity: 1; transform: scale(1); } }
.pt-menu-who {
  display: flex; align-items: center; gap: 10px; padding: 8px 8px 12px;
  border-bottom: 1px solid var(--line-soft, rgba(224, 165, 38, 0.35)); margin-bottom: 6px;
}
.pt-menu-who .pt-avatar { width: 40px; height: 40px; font-size: 14px; }
.pt-menu-who strong { display: block; font-size: 14px; font-weight: 600; }
.pt-menu-who span { display: block; font-size: 12px; color: var(--muted); margin-top: 2px; }
.pt-menu-item {
  appearance: none; width: 100%; display: flex; align-items: center; gap: 12px;
  min-height: 46px; padding: 0 10px; border: 0; border-radius: 10px; background: transparent;
  color: var(--text); font: inherit; font-size: 15px; cursor: pointer; text-align: left;
}
.pt-menu-item:hover { background: rgba(255, 255, 255, 0.05); }
.pt-menu-danger { color: #fca5a5; }
.pt-menu-danger:hover { background: rgba(239, 68, 68, 0.12); }
.pt-menu-item:focus-visible { outline: 2px solid var(--line-hi); outline-offset: 2px; }

/* Dialog konfirmasi logout */
.pt-dialog-wrap {
  position: fixed; inset: 0; z-index: 30; display: grid; place-items: center;
  padding: 20px; background: rgba(0, 0, 0, 0.6);
}
.pt-dialog {
  width: min(340px, 100%); background: var(--card-hi, #26211a); border: 1px solid var(--line);
  border-radius: 18px; padding: 20px; animation: pt-menu-pop 0.18s ease-out;
}
.pt-dialog h2 { margin: 0 0 6px; font-size: 18px; font-weight: 600; }
.pt-dialog p { margin: 0 0 18px; font-size: 14px; line-height: 1.55; color: var(--muted); }
.pt-dialog-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.pt-dialog-btn {
  appearance: none; min-height: 46px; border-radius: 12px;
  border: 1px solid var(--line-soft, rgba(224, 165, 38, 0.35)); background: transparent;
  color: var(--text); font: inherit; font-size: 15px; font-weight: 500; cursor: pointer;
}
.pt-dialog-btn:hover { background: rgba(255, 255, 255, 0.05); }
.pt-dialog-danger { background: var(--red); border-color: var(--red); color: #fff; }
.pt-dialog-danger:hover { background: #dc2626; }
.pt-dialog-btn:focus-visible { outline: 2px solid var(--line-hi); outline-offset: 2px; }

/* ---- Layar loading pembuka (BootLoading) ---- */
.bl-root {
  position: fixed; inset: 0; z-index: 60;
  display: flex; align-items: center; justify-content: center;
  padding: calc(24px + env(safe-area-inset-top, 0px)) 24px calc(24px + env(safe-area-inset-bottom, 0px));
  background: radial-gradient(110% 70% at 50% 40%, #12244a 0%, #0a1428 55%, #050a14 100%);
  background-color: #0a1428;
  color: #f2ead6;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  transition: opacity 0.5s ease;
}
.bl-root.is-out { opacity: 0; pointer-events: none; }
.bl-root *, .bl-root *::before, .bl-root *::after { box-sizing: border-box; }
.bl-ball svg, .bl-ball img { display: block; width: 100%; height: 100%; }
.bl-bar { width: 100%; height: 3px; border-radius: 3px; background: rgba(212, 169, 79, 0.18); overflow: hidden; }
.bl-bar > span { display: block; height: 100%; background: linear-gradient(90deg, #d4a94f, #f3d98f); }
.bl-box {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 22px;
  width: min(86vw, 320px);
  padding: 32px 24px 26px;
  border: 1px solid rgba(212, 169, 79, 0.55);
  border-radius: 16px;
  background: rgba(10, 20, 40, 0.72);
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.45), inset 0 0 0 1px rgba(243, 217, 143, 0.06);
  animation: bl-pop 0.7s cubic-bezier(.3, 1.4, .5, 1) both;
}
.bl-arena {
  position: relative;
  width: 100%;
  height: 240px;
  border-radius: 10px;
  background: rgba(212, 169, 79, 0.05);
  box-shadow: inset 0 0 0 1px rgba(212, 169, 79, 0.22);
  overflow: hidden;
}
.bl-ball {
  position: absolute;
  left: 0;
  top: 0;
  width: 52px;
  height: 52px;
  will-change: transform;
  filter: drop-shadow(0 4px 10px rgba(0, 0, 0, 0.55));
}
.bl-chase { position: absolute; left: 0; right: 0; bottom: 0; height: 54px; overflow: hidden; }
.bl-floor { position: absolute; left: 0; right: 0; bottom: 1px; height: 2px; border-radius: 2px; background: rgba(212, 169, 79, 0.35); }
.bl-runner { position: absolute; bottom: 3px; left: -14%; width: 33px; height: 40px; }
.bl-cop   { animation: bl-copmove 6s linear infinite,   bl-fade 6s linear infinite; }
.bl-thief { animation: bl-thiefmove 6s linear infinite, bl-fade 6s linear infinite; }
.bl-runner svg { width: 100%; height: 100%; overflow: visible; fill: none; stroke-width: 2.6; stroke-linecap: round; stroke-linejoin: round; }
.bl-thief svg { stroke: #f2ead6; transform-origin: 50% 96%; animation: bl-tumble 6s ease-out infinite; }
.bl-cop svg { stroke: #7fb0ff; }

/* pose kaki bergantian saat berlari */
.bl-pa { animation: bl-pa 0.34s step-end infinite; }
.bl-pb { animation: bl-pb 0.34s step-end infinite; }
.bl-thief .bl-pa, .bl-thief .bl-pb { animation-duration: 0.28s; }

/* tiap pose hanya tampil pada fase-nya */
.bl-c-run   { animation: bl-vis-crun 6s step-end infinite; }
.bl-c-aim   { animation: bl-vis-caim 6s step-end infinite; }
.bl-c-stand { animation: bl-vis-cstand 6s step-end infinite; }
.bl-t-run   { animation: bl-vis-trun 6s step-end infinite; }
.bl-t-fall  { animation: bl-vis-tfall 6s step-end infinite; }

/* peluru, kilatan, dan teks */
.bl-bullet { position: absolute; bottom: 28px; left: 41%; width: 12px; height: 2px; border-radius: 2px; background: #ffd54a; box-shadow: 0 0 6px #ffd54a; opacity: 0; animation: bl-shot 6s linear infinite; }
.bl-flash { position: absolute; bottom: 21px; left: 39.5%; width: 14px; height: 14px; border-radius: 50%; background: radial-gradient(circle, #fff6c2 0%, #ffd54a 45%, transparent 70%); opacity: 0; animation: bl-flashk 6s step-end infinite; }
.bl-dor { position: absolute; bottom: 38px; left: 38%; font: 700 11px/1 system-ui, sans-serif; color: #ffd54a; letter-spacing: 0.04em; opacity: 0; animation: bl-dork 6s step-end infinite; }

@keyframes bl-copmove   { 0% { left: -14%; } 26% { left: 30%; } 100% { left: 30%; } }
@keyframes bl-thiefmove { 0% { left: -14%; } 40% { left: 76%; } 46% { left: 72%; } 100% { left: 72%; } }
@keyframes bl-fade { 0%, 70% { opacity: 1; } 72%, 100% { opacity: 0; } }
@keyframes bl-tumble { 0%, 40% { transform: rotate(0); } 45% { transform: rotate(-108deg); } 48% { transform: rotate(-84deg); } 51% { transform: rotate(-93deg); } 54%, 100% { transform: rotate(-90deg); } }
@keyframes bl-vis-crun   { 0% { opacity: 1; } 26% { opacity: 0; } 100% { opacity: 0; } }
@keyframes bl-vis-caim   { 0% { opacity: 0; } 26% { opacity: 1; } 42% { opacity: 0; } 100% { opacity: 0; } }
@keyframes bl-vis-cstand { 0% { opacity: 0; } 42% { opacity: 1; } 100% { opacity: 1; } }
@keyframes bl-vis-trun   { 0% { opacity: 1; } 40% { opacity: 0; } 100% { opacity: 0; } }
@keyframes bl-vis-tfall  { 0% { opacity: 0; } 40% { opacity: 1; } 100% { opacity: 1; } }
@keyframes bl-shot   { 0%, 31.9% { left: 41%; opacity: 0; } 32% { left: 41%; opacity: 1; } 40% { left: 78%; opacity: 1; } 40.5%, 100% { left: 78%; opacity: 0; } }
@keyframes bl-flashk { 0%, 31.9% { opacity: 0; } 32% { opacity: 1; } 34.5% { opacity: 0; } 100% { opacity: 0; } }
@keyframes bl-dork   { 0%, 31.9% { opacity: 0; } 32% { opacity: 1; } 39% { opacity: 0; } 100% { opacity: 0; } }
@keyframes bl-pa { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
@keyframes bl-pb { 0%, 100% { opacity: 0; } 50% { opacity: 1; } }
.bl-curtain-l, .bl-curtain-r {
  position: absolute; top: 0; bottom: 0; width: 50.5%; z-index: 5; pointer-events: none;
  background:
    repeating-linear-gradient(90deg, rgba(0,0,0,0.28) 0 3px, transparent 3px 16px, rgba(255,255,255,0.07) 16px 19px, transparent 19px 32px),
    linear-gradient(180deg, #8a1636 0%, #6b0f2a 100%);
  box-shadow: 0 0 18px rgba(0, 0, 0, 0.6);
}
.bl-curtain-l { left: 0; border-right: 3px solid #d4a94f; transform: translateX(-101%); animation: bl-curl 6s linear infinite; }
.bl-curtain-r { right: 0; border-left: 3px solid #d4a94f; transform: translateX(101%); animation: bl-curr 6s linear infinite; }
.bl-curtain-l::after, .bl-curtain-r::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 8px; background: repeating-linear-gradient(90deg, #d4a94f 0 3px, transparent 3px 8px); opacity: 0.7; }
.bl-tamat { position: absolute; inset: 0; z-index: 6; display: flex; align-items: center; justify-content: center; font: 700 20px/1 Georgia, "Times New Roman", serif; letter-spacing: 0.06em; color: #f3d98f; text-shadow: 0 2px 10px rgba(0,0,0,0.7); opacity: 0; pointer-events: none; animation: bl-tamatk 6s ease-out infinite; }
@keyframes bl-curl { 0%, 58% { transform: translateX(-101%); animation-timing-function: cubic-bezier(.3, 1.2, .5, 1); } 66%, 86% { transform: translateX(0); animation-timing-function: ease-in; } 94%, 100% { transform: translateX(-101%); } }
@keyframes bl-curr { 0%, 58% { transform: translateX(101%); animation-timing-function: cubic-bezier(.3, 1.2, .5, 1); } 66%, 86% { transform: translateX(0); animation-timing-function: ease-in; } 94%, 100% { transform: translateX(101%); } }
@keyframes bl-tamatk { 0%, 64% { opacity: 0; transform: scale(0.85); } 70%, 84% { opacity: 1; transform: scale(1); } 88%, 100% { opacity: 0; transform: scale(1); } }
.bl-bar {
  width: 100%;
  height: 3px;
  border-radius: 3px;
  background: rgba(212, 169, 79, 0.18);
  overflow: hidden;
}
.bl-credit { position: absolute; right: 16px; top: 10px; margin: 0; font-size: 11px; letter-spacing: 0.03em; color: #8d9cb8; opacity: 0.85; }
.bl-text { margin: 0; font-size: 14px; color: #8d9cb8; letter-spacing: 0.02em; }
@keyframes bl-pop { 0% { transform: scale(0.85); opacity: 0; } 60% { transform: scale(1.05); opacity: 1; } 80% { transform: scale(0.98); } 100% { transform: scale(1); } }

@media (prefers-reduced-motion: reduce) {
  .bl-box { animation: none; }
  .bl-runner, .bl-thief svg, .bl-pa, .bl-pb, .bl-c-run, .bl-c-aim, .bl-c-stand, .bl-t-run, .bl-t-fall, .bl-bullet, .bl-flash, .bl-dor, .bl-curtain-l, .bl-curtain-r, .bl-tamat { animation: none; }
  .bl-cop { left: 30%; }
  .bl-thief { left: 72%; }
  .bl-thief svg { transform: rotate(-90deg); }
  .bl-pb, .bl-c-run, .bl-c-aim, .bl-t-run, .bl-bullet, .bl-flash, .bl-dor, .bl-tamat { opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .pt-bar-fill, .pt-tab, .pt-link, .pt-input, .pt-submit, .pt-secondary, .pt-ops-card, .pt-back-sq, .pt-seg-btn, .pt-log-chev { transition: none; }
  .pt-logo-wrap, .pt-logo-wrap::before, .pt-loadtext { animation: none; }
  .pt-loadfill { transition: none; }
  .pt-page, .pt-rise { animation: none; }
}
`;
