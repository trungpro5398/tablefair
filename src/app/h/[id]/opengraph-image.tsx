import { ImageResponse } from "next/og";
import { initials, memberColor } from "@/lib/members";
import { getHuddle } from "@/lib/store";
import type { RankedCandidate } from "@/lib/types";

export const alt = "A TableFair huddle";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK = "#221a2e";
const MUTED = "#6b6477";
const BRAND = "#5b2a86";

/** One option as a little bar chart: a bar per person, the least-matched person with a preference labelled. */
function bars(label: string, c: RankedCandidate, fair: boolean) {
  const cared = c.scores.filter((s) => !s.flexible);
  const low = [...(cared.length ? cared : c.scores)].sort((a, b) => a.satisfaction - b.satisfaction)[0];
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        padding: "22px 26px",
        borderRadius: 28,
        background: fair ? "#fbf1dd" : "#f1eef6",
      }}
    >
      <div style={{ fontSize: 22, color: MUTED }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 700, color: INK, marginTop: 4 }}>
        {c.entity.name.length > 26 ? `${c.entity.name.slice(0, 25)}…` : c.entity.name}
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 14, height: 150, marginTop: 14 }}>
        {c.scores.slice(0, 8).map((s, i) => {
          const v = Math.round(s.satisfaction * 100);
          const strong = s.member_id === low?.member_id;
          return (
            <div key={s.member_id} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
              <div style={{ fontSize: 22, fontWeight: strong ? 700 : 400, color: strong ? INK : MUTED }}>{String(v)}</div>
              <div
                style={{
                  width: "100%",
                  height: Math.max(6, Math.round(v * 1.1)),
                  borderRadius: "10px 10px 0 0",
                  background: memberColor(i),
                  opacity: s.flexible ? 0.3 : !fair && !strong ? 0.45 : 1,
                }}
              />
              <div style={{ fontSize: 20, fontWeight: 700, color: memberColor(i), marginTop: 6 }}>{initials(s.member_name)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const huddle = await getHuddle(id).catch(() => null);
  const result = huddle?.result;
  const pick = result?.picks[0];
  const top = pick && result?.ranked.find((r) => r.entity.entity_id === pick.entity_id);
  const avg = result?.majority && top && result.majority.entity.entity_id !== top.entity.entity_id ? result.majority : undefined;
  const names = huddle?.members.map((m) => m.name).join(", ");

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "52px 64px",
          background: "#f7f7fa",
          color: INK,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 30, fontWeight: 700 }}>
            <div style={{ width: 52, height: 52, borderRadius: 14, background: BRAND, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
              ⌒
            </div>
            TableFair
          </div>
          <div style={{ fontSize: 28, color: BRAND }}>{huddle?.title ?? "Group huddle"}</div>
        </div>

        {top ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ fontSize: 30, color: MUTED }}>
              {`Our fair pick: nobody with a preference below ${Math.round(top.min_satisfaction * 100)}%`}
            </div>
            <div style={{ display: "flex", gap: 24 }}>
              {avg ? bars("A simple average picks", avg, false) : null}
              {bars("TableFair picks", top, true)}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ fontSize: 72, fontWeight: 700, lineHeight: 1.05 }}>Add your 3 favourites so we can decide</div>
            <div style={{ fontSize: 30, color: MUTED }}>{names ? `In so far: ${names}` : "Films, shows, artists or books. Takes 30 seconds."}</div>
          </div>
        )}

        <div style={{ fontSize: 22, color: MUTED }}>{"Fair group picks on Qloo's taste graph · tablefair.vercel.app"}</div>
      </div>
    ),
    size,
  );
}
