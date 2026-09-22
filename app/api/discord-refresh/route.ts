import { NextResponse } from "next/server";
import { mapRolesToPangkatDivisi } from "../../../lib/discord";

// Route ini berjalan di server Vercel, BUKAN di browser, jadi Client Secret aman di sini.
const GUILD_ID = process.env.NEXT_PUBLIC_DISCORD_GUILD_ID ?? "";
const CLIENT_ID = process.env.DISCORD_CLIENT_ID ?? "";
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET ?? "";

export async function POST(req: Request) {
  try {
    const { refreshToken } = (await req.json()) as { refreshToken?: string };
    if (!refreshToken || !CLIENT_ID || !CLIENT_SECRET) {
      return NextResponse.json({ error: "not_configured" }, { status: 400 });
    }

    // 1) Tukar refresh token lama dengan access token baru dari Discord
    const tokenRes = await fetch("https://discord.com/api/v10/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });
    if (!tokenRes.ok) return NextResponse.json({ error: "refresh_failed" }, { status: 400 });
    const tokenData = (await tokenRes.json()) as {
      access_token: string;
      refresh_token: string;
    };
    const accessToken = tokenData.access_token;

    // 2) Ambil profil terbaru (nama & foto) langsung dari Discord
    const meRes = await fetch("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!meRes.ok) return NextResponse.json({ error: "profile_failed" }, { status: 400 });
    const me = (await meRes.json()) as {
      id: string;
      username: string;
      global_name?: string | null;
      avatar?: string | null;
    };
    const name = me.global_name || me.username || "Personil";
    const avatarUrl = me.avatar
      ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png?size=128`
      : "";

    // 3) Ambil role di server untuk pangkat & devisi
    let rank = "Bukan anggota server";
    let unit = "-";
    if (GUILD_ID) {
      const memberRes = await fetch(
        `https://discord.com/api/v10/users/@me/guilds/${GUILD_ID}/member`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (memberRes.ok) {
        const member = (await memberRes.json()) as { roles?: string[] };
        const roles = Array.isArray(member.roles) ? member.roles : [];
        ({ rank, unit } = mapRolesToPangkatDivisi(roles));
      }
    }

    return NextResponse.json({
      name,
      avatarUrl,
      rank,
      unit,
      refreshToken: tokenData.refresh_token, // Discord memberi refresh token baru tiap kali dipakai
    });
  } catch {
    return NextResponse.json({ error: "unexpected" }, { status: 500 });
  }
}
