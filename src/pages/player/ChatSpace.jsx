import { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { useLang } from "../../lib/i18n";
import { GAMES, ROSTERS } from "../../lib/constants";
import { ChatMessages } from "../../components/ChatMessages";
import { Globe, Gamepad2, Users } from "lucide-react";

export default function ChatSpace() {
  const { game, roster, isOfficial } = useAuth();
  const { t } = useLang();

  const channels = [];

  // Game channels
  if (isOfficial) GAMES.forEach((g) => channels.push({ id: `game_${g}`, label: g, icon: Gamepad2 }));
  else if (game) channels.push({ id: `game_${game}`, label: game, icon: Gamepad2 });

  // Roster channels — only for RL game
  if (isOfficial) {
    // Official sees all roster channels
    (ROSTERS["Rocket League"] || []).forEach((r) =>
      channels.push({ id: `roster_${r}`, label: r, icon: Users })
    );
  } else if (game === "Rocket League" && roster) {
    // RL player only sees their own roster channel
    channels.push({ id: `roster_${roster}`, label: roster, icon: Users });
  }

  // Global channel — always last
  channels.push({ id: "global", label: t("player.channel.global"), icon: Globe });

  const [channel, setChannel] = useState(channels[0].id);

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-white/10 bg-[#141414] px-4 flex gap-1 shrink-0 overflow-x-auto" data-testid="chat-channel-tabs">
        {channels.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setChannel(id)} data-testid={`chat-channel-${id}`}
            className={`flex items-center gap-2 px-4 py-3 text-xs uppercase tracking-wider border-b-2 transition-colors whitespace-nowrap ${channel === id ? "border-[#D8CA82] text-[#D8CA82]" : "border-transparent text-[#f7f7f7]/50 hover:text-[#f7f7f7]"}`}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0">
        <ChatMessages key={channel} path={`chats/${channel}/messages`} testId="player-chat" />
      </div>
    </div>
  );
}
