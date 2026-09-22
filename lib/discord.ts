const GUILD_ID = process.env.NEXT_PUBLIC_DISCORD_GUILD_ID ?? "";

// Urutkan dari pangkat TERTINGGI ke terendah. Ganti ID di bawah dengan ID role Discord-mu.
const RANK_ROLES: [string, string][] = [
  ["GANTI_ID_ROLE_1", "ABRIGPOL"],
  ["GANTI_ID_ROLE_2", "BRIPDA"],
];
const UNIT_ROLES: [string, string][] = [
  ["GANTI_ID_ROLE_3", "SABHARA"],
  ["GANTI_ID_ROLE_4", "LANTAS"],
];

export async function fetchDiscordGuildRoles(token: string): Promise<string[] | null> {
  const res = await fetch(
    `https://discord.com/api/v10/users/@me/guilds/${GUILD_ID}/member`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return null;
  const member = await res.json();
  return Array.isArray(member.roles) ? member.roles : [];
}

/**
 * Ambil nama & foto LANGSUNG dari Discord (bukan dari snapshot lama yang disimpan
 * Supabase di user_metadata, yang tidak otomatis ter-update saat foto profil berganti).
 * Dipakai tepat setelah login, selagi access token dari Discord masih berlaku.
 */
export async function fetchDiscordProfile(
  token: string
): Promise<{ name: string; avatarUrl: string } | null> {
  const res = await fetch("https://discord.com/api/v10/users/@me", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const me = (await res.json()) as {
    id: string;
    username: string;
    global_name?: string | null;
    avatar?: string | null;
  };
  const name = me.global_name || me.username || "Personil";
  const avatarUrl = me.avatar
    ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png?size=128`
    : "";
  return { name, avatarUrl };
}

export function mapRolesToPangkatDivisi(roles: string[]) {
  const rank = RANK_ROLES.find(([id]) => roles.includes(id))?.[1] ?? "-";
  const unit = UNIT_ROLES.find(([id]) => roles.includes(id))?.[1] ?? "-";
  return { rank, unit };
}
