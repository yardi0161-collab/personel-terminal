const GUILD_ID = process.env.NEXT_PUBLIC_DISCORD_GUILD_ID ?? "";

// Urutkan dari pangkat TERTINGGI ke terendah
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

export function mapRolesToPangkatDivisi(roles: string[]) {
  const rank = RANK_ROLES.find(([id]) => roles.includes(id))?.[1] ?? "-";
  const unit = UNIT_ROLES.find(([id]) => roles.includes(id))?.[1] ?? "-";
  return { rank, unit };
}
