"use client";
<div className="max-w-6xl mx-auto p-4 md:p-8">
<header className="mb-4 flex items-center justify-between">
<h1 className="text-xl md:text-2xl font-semibold tracking-tight">{title}</h1>
</header>


<div className="grid md:grid-cols-3 gap-6">
<div className="md:col-span-1">
<div className="rounded-2xl bg-neutral-900/70 border border-neutral-800 p-4 shadow">
<audio ref={audioRef} src={audioSrc} preload="metadata" />


<div className="flex items-center gap-3">
<button onClick={togglePlay} className="p-3 rounded-xl border border-neutral-700 hover:bg-neutral-800 transition shadow" aria-label={isPlaying ? "Pause" : "Play"}>
{isPlaying ? <Pause size={18} /> : <Play size={18} />}
</button>
<button onClick={() => seekTo(currentTime - 10)} className="p-2 rounded-lg hover:bg-neutral-800" aria-label="Back 10s">
<SkipBack size={18} />
</button>
<button onClick={() => seekTo(currentTime + 10)} className="p-2 rounded-lg hover:bg-neutral-800" aria-label="Forward 10s">
<SkipForward size={18} />
</button>
</div>


<div className="mt-4">
<input type="range" min={0} max={duration || 0} step={0.01} value={currentTime} onChange={(e) => seekTo(Number(e.target.value))} className="w-full accent-white" />
<div className="flex justify-between text-xs text-neutral-400 mt-1">
<span>{formatTime(currentTime)}</span>
<span>{duration ? formatTime(duration) : "0:00"}</span>
</div>
</div>


<div className="mt-4 flex items-center gap-2 text-sm">
<Volume2 size={16} />
<input type="range" min={0} max={1} step={0.01} value={volume} onChange={onVolume} className="w-full accent-white" />
</div>


<div className="mt-6 grid grid-cols-3 gap-2 text-sm">
<div className="col-span-2 flex items-center gap-2 px-3 py-2 rounded-xl border border-neutral-800 bg-neutral-900/50">
<Search size={16} />
<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search transcript…" className="bg-transparent outline-none w-full" />
</div>
<select value={speakerFilter} onChange={(e) => setSpeakerFilter(e.target.value as any)} className="px-3 py-2 rounded-xl border border-neutral-800 bg-neutral-900/50">
<option value="all">All speakers</option>
{speakers.map(s => (<option key={s} value={s}>{s}</option>))}
</select>
</div>


<div className="mt-4 text-xs text-neutral-400">
<p>Shortcuts: <kbd className="px-1 py-0.5 rounded bg-neutral-800 border border-neutral-700">Space</kbd> play/pause, <kbd className="px-1 py-0.5 rounded bg-neutral-800 border border-neutral-700">J</kbd> prev, <kbd className="px-1 py-0.5 rounded bg-neutral-800 border border-neutral-700">K</kbd> next, ←/→ ±5s</p>
</div>
</div>
</div>


<div className="md:col-span-2">
<div className="h-[70vh] md:h-[72vh] overflow-auto rounded-2xl border border-neutral-800 bg-neutral-900/40 p-2 md:p-3">
{filtered.map((t, i) => {
const active = i === activeIndex;
return (
<div key={t.id} ref={active ? activeLineRef : null} onClick={() => onLineClick(t)}
className={["cursor-pointer rounded-xl px-3 py-2 mb-2 transition border",
active ? "bg-white text-neutral-900 border-white" : "hover:bg-neutral-800/70 border-transparent"].join(" ")}
>
<div className="flex items-center gap-2 text-xs md:text-[13px]">
<span className={active ? "font-semibold" : "text-neutral-400"}>{t.speaker ?? "Speaker"}</span>
<span className="text-neutral-400">•</span>
<span className="tabular-nums text-neutral-400">{formatTime(t.start)}</span>
</div>
<div className="mt-0.5 leading-relaxed md:text-[15px]">{t.text}</div>
</div>
);
})}
{filtered.length === 0 && (
<div className="text-center py-12 text-neutral-400">No lines match your filter.</div>
)}
</div>
</div>
</div>
</div>
</div>
);
}