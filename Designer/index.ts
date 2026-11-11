/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Pinki
 */

import { definePluginSettings } from "@api/Settings";
import { ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalRoot, openModal } from "@utils/modal";
import definePlugin, { OptionType } from "@utils/types";
import { ChannelStore, Constants, PermissionsBits, PermissionStore, React, RestAPI } from "@webpack/common";


const h = (...args: any[]) => (React.createElement as any)(...args);

const MODIFIERS = ["ctrl", "alt", "shift", "meta"];
const MOD_LABELS: Record<string, string> = { ctrl: "Ctrl", alt: "Alt", shift: "Shift", meta: "Meta" };
const DEFAULT_KEYBIND = "Alt";

let hoveredChannelId: string | null = null;
let modalOpen = false;
let recording = false;

function normalizeKey(key: string) {
    const k = key.toLowerCase();
    if (k === "control") return "ctrl";
    if (k === "os" || k === "win" || k === "cmd" || k === "command") return "meta";
    if (k === " ") return "space";
    return k;
}

function keyLabel(key: string) {
    if (key === " ") return "Space";
    return key.length === 1 ? key.toUpperCase() : key;
}

function KeybindRecorder() {
    const [bind, setBind] = React.useState<string>(settings.store.keybind || DEFAULT_KEYBIND);
    const [listening, setListening] = React.useState(false);

    React.useEffect(() => {
        if (!listening) return;
        recording = true;

        const down = new Set<string>();
        const peak = new Set<string>();

        const finish = (value?: string) => {
            if (value) {
                settings.store.keybind = value;
                setBind(value);
            }
            setListening(false);
        };

        const onDown = (e: KeyboardEvent) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.repeat) return;

            const k = normalizeKey(e.key);
            if (k === "escape" && !down.size) return finish();

            if (MODIFIERS.includes(k)) {
                down.add(k);
                peak.add(k);
                return;
            }

            const held: Record<string, boolean> = { ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey };
            const mods = MODIFIERS.filter(m => held[m]).map(m => MOD_LABELS[m]);
            finish([...mods, keyLabel(e.key)].join("+"));
        };

       
        const onUp = (e: KeyboardEvent) => {
            e.preventDefault();
            e.stopPropagation();
            down.delete(normalizeKey(e.key));
            if (!down.size && peak.size) {
                finish(MODIFIERS.filter(m => peak.has(m)).map(m => MOD_LABELS[m]).join("+"));
            }
        };

        window.addEventListener("keydown", onDown, true);
        window.addEventListener("keyup", onUp, true);

        return () => {
            recording = false;
            window.removeEventListener("keydown", onDown, true);
            window.removeEventListener("keyup", onUp, true);
        };
    }, [listening]);

    const button = {
        padding: "8px 14px",
        borderRadius: "4px",
        border: "1px solid var(--background-modifier-accent)",
        background: listening ? "var(--brand-500, #5865f2)" : "var(--background-secondary)",
        color: listening ? "#fff" : "var(--text-normal)",
        cursor: "pointer",
        fontSize: "14px",
        minWidth: "140px",
    };

    return h("div", { style: { display: "flex", flexDirection: "column", gap: "6px", marginBottom: "16px" } },
        h("div", { style: { color: "var(--header-primary, var(--text-normal))", fontSize: "16px", fontWeight: 600 } }, "Keybind"),
        h("div", { style: { color: "var(--text-muted)", fontSize: "14px" } }, "Hover a channel and press this to open the editor. Click the button, then press your keys."),
        h("div", { style: { display: "flex", gap: "8px", alignItems: "center" } },
            h("button", { type: "button", style: button, onClick: () => setListening(l => !l) },
                listening ? "Press keys... (Esc to cancel)" : bind
            ),
            h("button", {
                type: "button",
                style: { ...button, background: "transparent", color: "var(--text-normal)", minWidth: 0 },
                onClick: () => {
                    settings.store.keybind = DEFAULT_KEYBIND;
                    setBind(DEFAULT_KEYBIND);
                    setListening(false);
                },
            }, "Reset")
        )
    );
}

const settings = definePluginSettings({
    keybind: {
        type: OptionType.STRING,
        description: "Keybind",
        default: DEFAULT_KEYBIND,
        hidden: true,
    },
    keybindRecorder: {
        type: OptionType.COMPONENT,
        description: "Keybind",
        component: () => h(KeybindRecorder),
    },
    showSymbols: {
        type: OptionType.BOOLEAN,
        description: "Show the symbols row",
        default: true,
    },
    showFrames: {
        type: OptionType.BOOLEAN,
        description: "Show the frames row",
        default: true,
    },
    showFonts: {
        type: OptionType.BOOLEAN,
        description: "Show the fonts row",
        default: true,
    },
    showPreview: {
        type: OptionType.BOOLEAN,
        description: "Show how text channel names will look after Discord formats them",
        default: true,
    },
});

const SYMBOLS = ["・", "┃", "│", "｜", "꒰", "꒱", "୨", "୧", "✦", "⋆", "★", "♡", "❀", "✿", "╭", "╰", "»", "«", "→", "⟡", "⊹", "₊", "˚", "ꕤ"];

const FRAMES = ["꒰ {n} ꒱", "・{n}", "┃{n}", "✦ {n} ✦", "╭・{n}", "»{n}«", "୨୧ {n}", "⊹ {n} ⊹", "【{n}】", "『{n}』"];

function mathFont(upper: number, lower: number, digit?: number) {
    return (text: string) => Array.from(text).map(ch => {
        const c = ch.codePointAt(0)!;
        if (c >= 65 && c <= 90) return String.fromCodePoint(upper + c - 65);
        if (c >= 97 && c <= 122) return String.fromCodePoint(lower + c - 97);
        if (digit !== undefined && c >= 48 && c <= 57) return String.fromCodePoint(digit + c - 48);
        return ch;
    }).join("");
}

const SMALL_CAPS = "ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘǫʀꜱᴛᴜᴠᴡxʏᴢ";

const FONTS: { label: string; apply: (s: string) => string; }[] = [
    { label: "Normal", apply: s => s.normalize("NFKC") },
    { label: "𝐁𝐨𝐥𝐝", apply: mathFont(0x1D400, 0x1D41A, 0x1D7CE) },
    { label: "𝗦𝗮𝗻𝘀", apply: mathFont(0x1D5D4, 0x1D5EE, 0x1D7EC) },
    { label: "𝑰𝒕𝒂𝒍𝒊𝒄", apply: mathFont(0x1D468, 0x1D482) },
    { label: "𝓢𝓬𝓻𝓲𝓹𝓽", apply: mathFont(0x1D4D0, 0x1D4EA) },
    { label: "𝙼𝚘𝚗𝚘", apply: mathFont(0x1D670, 0x1D68A, 0x1D7F6) },
    {
        label: "ꜱᴍᴀʟʟ ᴄᴀᴘꜱ",
        apply: s => Array.from(s).map(ch => {
            const i = ch.toLowerCase().charCodeAt(0) - 97;
            return ch.length === 1 && i >= 0 && i < 26 ? SMALL_CAPS[i] : ch;
        }).join(""),
    },
    {
        label: "Ｗｉｄｅ",
        apply: s => Array.from(s).map(ch => {
            const c = ch.charCodeAt(0);
            return ch.length === 1 && c >= 33 && c <= 126 ? String.fromCharCode(c + 0xFEE0) : ch;
        }).join(""),
    },
];


const SLUGGED_TYPES = new Set([0, 5, 15]);


const RATE_WINDOW = 10 * 60 * 1000;
const renameLog = new Map<string, number[]>();
const previousNames = new Map<string, string>();

function recentRenames(channelId: string) {
    const now = Date.now();
    const list = (renameLog.get(channelId) ?? []).filter(t => now - t < RATE_WINDOW);
    renameLog.set(channelId, list);
    return list;
}

function toast(message: string, ok = true) {
    const el = document.createElement("div");
    el.textContent = message;
    Object.assign(el.style, {
        position: "fixed",
        bottom: "28px",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: "100000",
        padding: "10px 16px",
        borderRadius: "8px",
        background: ok ? "#23a55a" : "#da373c",
        color: "#fff",
        fontSize: "14px",
        fontWeight: "500",
        boxShadow: "0 4px 14px rgba(0,0,0,.4)",
        pointerEvents: "none",
        transition: "opacity .3s",
    });
    document.body.appendChild(el);
    setTimeout(() => {
        el.style.opacity = "0";
        setTimeout(() => el.remove(), 300);
    }, 2800);
}

function isEditable(target: EventTarget | null) {
    const el = target as HTMLElement | null;
    if (!el) return false;
    return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable;
}

function matchesKeybind(e: KeyboardEvent, bind: string) {
    const parts = bind.split("+").map(p => normalizeKey(p.trim())).filter(Boolean);
    if (!parts.length) return false;

    const wantedMods = parts.filter(p => MODIFIERS.includes(p));
    const keyPart = parts.find(p => !MODIFIERS.includes(p));
    const pressed = normalizeKey(e.key);
    const held: Record<string, boolean> = { ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey };

    if (keyPart) {
        if (pressed !== keyPart) return false;
        return MODIFIERS.every(m => held[m] === wantedMods.includes(m));
    }

    if (!wantedMods.includes(pressed)) return false;
    return wantedMods.every(m => held[m]) && MODIFIERS.every(m => wantedMods.includes(m) || !held[m]);
}

function onMouseOver(e: MouseEvent) {
    const el = (e.target as HTMLElement)?.closest?.('[data-list-item-id^="channels___"]');
    hoveredChannelId = el?.getAttribute("data-list-item-id")?.slice("channels___".length) ?? null;
}

function onMouseLeaveWindow() {
    hoveredChannelId = null;
}

function onKeyDown(e: KeyboardEvent) {
    if (recording || modalOpen || !hoveredChannelId || e.repeat) return;

    const bind = settings.store.keybind || DEFAULT_KEYBIND;
    const hasNormalKey = bind.split("+").some(p => !MODIFIERS.includes(normalizeKey(p.trim())));


    if (hasNormalKey && isEditable(e.target)) return;
    if (!matchesKeybind(e, bind)) return;

    const channel = ChannelStore.getChannel(hoveredChannelId);
    if (!channel?.guild_id) return;

    e.preventDefault();
    e.stopPropagation();

    if (!PermissionStore.can(PermissionsBits.MANAGE_CHANNELS, channel)) {
        toast("You don't have perms to edit this channel", false);
        return;
    }

    openEditor(channel);
}

const chipStyle = {
    background: "var(--background-secondary)",
    color: "var(--text-normal)",
    border: "1px solid var(--background-modifier-accent)",
    borderRadius: "4px",
    padding: "4px 8px",
    cursor: "pointer",
    fontSize: "14px",
};

const rowStyle = { display: "flex", flexWrap: "wrap", gap: "4px" };
const labelStyle = { color: "var(--header-secondary, var(--text-muted))", fontSize: "12px", fontWeight: 700, textTransform: "uppercase", marginTop: "4px" };
const mutedStyle = { color: "var(--text-muted)", fontSize: "12px" };
const textStyle = { color: "var(--text-normal)" };

function btnStyle(primary: boolean, disabled = false) {
    return {
        padding: "8px 16px",
        borderRadius: "4px",
        border: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        fontSize: "14px",
        fontWeight: 500,
        background: primary ? "var(--brand-500, #5865f2)" : "transparent",
        color: primary ? "#fff" : "var(--text-normal)",
    };
}

function Editor({ modalProps, channel }: { modalProps: any; channel: any; }) {
    const [name, setName] = React.useState<string>(channel.name);
    const [saving, setSaving] = React.useState(false);
    const inputRef = React.useRef<HTMLInputElement>(null);

    const slugged = SLUGGED_TYPES.has(channel.type);
    const preview = slugged ? name.toLowerCase().replace(/\s+/g, "-") : name;
    const trimmed = name.trim();
    const tooLong = trimmed.length > 100;
    const unchanged = trimmed === channel.name;
    const disabled = saving || !trimmed || tooLong || unchanged;
    const used = recentRenames(channel.id).length;
    const previous = previousNames.get(channel.id);

    function getSelection() {
        const el = inputRef.current;
        return { start: el?.selectionStart ?? name.length, end: el?.selectionEnd ?? name.length };
    }

    function moveCaret(pos: number) {
        requestAnimationFrame(() => {
            inputRef.current?.focus();
            inputRef.current?.setSelectionRange(pos, pos);
        });
    }

    function insert(text: string) {
        const { start, end } = getSelection();
        setName(name.slice(0, start) + text + name.slice(end));
        moveCaret(start + text.length);
    }


    function applyFont(apply: (s: string) => string) {
        const { start, end } = getSelection();
        if (start === end) {
            const next = apply(name);
            setName(next);
            moveCaret(next.length);
        } else {
            const styled = apply(name.slice(start, end));
            setName(name.slice(0, start) + styled + name.slice(end));
            moveCaret(start + styled.length);
        }
    }

    function applyFrame(frame: string) {
        const next = frame.replace("{n}", name.trim());
        setName(next);
        moveCaret(next.length);
    }

    async function save(newName = trimmed) {
        if (saving || !newName || newName.length > 100 || newName === channel.name) return;
        setSaving(true);
        try {
            await RestAPI.patch({
                url: Constants.Endpoints.CHANNEL(channel.id),
                body: { name: newName },
            });
            previousNames.set(channel.id, channel.name);
            recentRenames(channel.id).push(Date.now());
            toast("Channel renamed");
            modalProps.onClose();
        } catch (err: any) {
            let msg = "Couldn't rename the channel";
            if (err?.status === 429) msg = "Rate limited, you can only rename a channel twice every 10 minutes";
            else if (err?.body?.code === 50013) msg = "Missing permissions";
            else msg = err?.body?.errors?.name?._errors?.[0]?.message ?? err?.body?.message ?? msg;
            toast(msg, false);
            setSaving(false);
        }
    }

    return h(ModalRoot, { ...modalProps, size: "small" },
        h(ModalHeader, null,
            h("h2", { style: { ...textStyle, margin: 0, flexGrow: 1, fontSize: "18px", fontWeight: 600 } }, "Designer"),
            h(ModalCloseButton, { onClick: modalProps.onClose })
        ),
        h(ModalContent, null,
            h("form", {
                style: { display: "flex", flexDirection: "column", gap: "8px", padding: "12px 0" },
                onSubmit: (e: Event) => { e.preventDefault(); save(); },
            },
                h("div", { style: { display: "flex", justifyContent: "space-between", ...mutedStyle } },
                    h("span", null, `Current: ${channel.name}`),
                    h("span", { style: { color: tooLong ? "var(--text-danger)" : undefined } }, `${trimmed.length}/100`)
                ),
                h("input", {
                    ref: inputRef,
                    value: name,
                    onChange: (e: any) => setName(e.target.value),
                    autoFocus: true,
                    placeholder: "channel name",
                    maxLength: 100,
                    style: {
                        width: "100%",
                        boxSizing: "border-box",
                        padding: "10px",
                        borderRadius: "4px",
                        border: "1px solid var(--background-modifier-accent)",
                        background: "var(--input-background, var(--background-tertiary))",
                        color: "var(--text-normal)",
                        fontSize: "16px",
                        outline: "none",
                    },
                }),

                settings.store.showPreview && slugged && h("div", { style: mutedStyle },
                    "Will show as ",
                    h("span", { style: { ...textStyle, fontWeight: 600 } }, `# ${preview}`)
                ),

                settings.store.showSymbols && h("div", { style: labelStyle }, "Symbols"),
                settings.store.showSymbols && h("div", { style: rowStyle },
                    ...SYMBOLS.map(sym => h("button", { key: sym, type: "button", style: chipStyle, onClick: () => insert(sym) }, sym))
                ),

                settings.store.showFrames && h("div", { style: labelStyle }, "Frames"),
                settings.store.showFrames && h("div", { style: rowStyle },
                    ...FRAMES.map(f => h("button", { key: f, type: "button", style: chipStyle, onClick: () => applyFrame(f) }, f.replace("{n}", "name")))
                ),

                settings.store.showFonts && h("div", { style: labelStyle }, "Fonts"),
                settings.store.showFonts && h("div", { style: rowStyle },
                    ...FONTS.map(f => h("button", { key: f.label, type: "button", style: chipStyle, onClick: () => applyFont(f.apply) }, f.label))
                ),

                h("div", { style: mutedStyle }, "Emojis: Win + . on Windows Ctrl + Cmd + Space on Mac"),

                used >= 2 && h("div", { style: { color: "var(--text-warning, #f0b232)", fontSize: "12px" } },
                    "You already renamed this channel twice in the last 10 minutes, the next one will probably get blocked watch out"
                ),

                previous && previous !== channel.name && h("button", {
                    type: "button",
                    style: { ...chipStyle, alignSelf: "flex-start" },
                    onClick: () => save(previous),
                }, `Undo (back to "${previous}")`)
            )
        ),
        h(ModalFooter, null,
            h("div", { style: { display: "flex", gap: "8px", flexDirection: "row-reverse", width: "100%" } },
                h("button", { type: "button", disabled, onClick: () => save(), style: btnStyle(true, disabled) }, saving ? "Saving..." : "Save"),
                h("button", { type: "button", onClick: modalProps.onClose, style: btnStyle(false) }, "Cancel")
            )
        )
    );
}

function openEditor(channel: any) {
    modalOpen = true;
    openModal((modalProps: any) => h(Editor, { modalProps, channel }), {
        onCloseCallback: () => { modalOpen = false; },
    });
}

export default definePlugin({
    name: "DesignerSettings",
    description: "Hover a channel and press your keybind to rename it with emojis, symbols, frames and fonts.",
    authors: [{ name: "Pinki", id: 0n }],
    settings,

    start() {
        document.addEventListener("mouseover", onMouseOver, true);
        document.addEventListener("mouseleave", onMouseLeaveWindow);
        document.addEventListener("keydown", onKeyDown, true);
    },

    stop() {
        document.removeEventListener("mouseover", onMouseOver, true);
        document.removeEventListener("mouseleave", onMouseLeaveWindow);
        document.removeEventListener("keydown", onKeyDown, true);
        hoveredChannelId = null;
        modalOpen = false;
    },
});
