// ── data/songStructure.js ─────────────────────────────────────────────────────

export const GLOBAL_CONTEXT = "Genre: Deep House. Key: A Minor. BPM: 124. High fidelity, studio master. ";

export const SONG_TIMELINE = [
  {
    id: "Intro",
    durationMs: 15_000, 
    prompt: "Atmospheric pads, filtered kick drum, low energy, deep bass rumble.",
    transitionWindowMs: 5_000, 
    transitionInstruction: "Slowly opening the filter on the kick drum, introducing hi-hats."
  },
  {
    id: "Verse 1",
    durationMs: 30_000,
    prompt: "Full kick drum, crisp hi-hats, minimal chord stabs, steady groove, deep sub-bass.",
    transitionWindowMs: 4_000,
    transitionInstruction: "Adding a rising white noise sweeper and snare roll to build tension."
  },
  {
    id: "Build-Up",
    durationMs: 10_000,
    prompt: "No bass, snare roll doubling in speed, rising synth pitch, high tension, hands-in-the-air moment.",
    transitionWindowMs: 1_500,
    transitionInstruction: "A sudden silence for one beat, then a massive impact."
  },
  {
    id: "Chorus (Drop)",
    durationMs: 30_000,
    prompt: "Maximum energy, heavy bassline, loud clap, complex percussion, main lead melody playing full volume.",
    transitionWindowMs: 5_000,
    transitionInstruction: "Energy fading out, removing the lead melody, simplifying the drums."
  },
  {
    id: "Interlude",
    durationMs: 15_000,
    prompt: "Stripped back groove, just bass and piano, atmospheric vocal chops, spacey reverb.",
    transitionWindowMs: 3_000,
    transitionInstruction: "Introducing a new melodic element, a high-pitched synth pluck."
  },
  {
    id: "Solo",
    durationMs: 30_000,
    prompt: "Driving beat with a complex, improvised trumpet solo, jazzy scales, expressive pitch bending.",
    transitionWindowMs: 5_000,
    transitionInstruction: "Solo instrument fading into the background, drums becoming sparse."
  },
  {
    id: "Bridge",
    durationMs: 15_000,
    prompt: "Breakdown, no drums, washing synth chords, emotional and cinematic texture.",
    transitionWindowMs: 4_000,
    transitionInstruction: "Rapidly building snare roll, rising pitch riser, anticipation for the final drop."
  },
  {
    id: "Final Chorus",
    durationMs: 30_000,
    prompt: "Explosive energy, all elements playing, euphoric melody, driving rhythm, full frequency spectrum.",
    transitionWindowMs: 5_000,
    transitionInstruction: "Instruments dropping out one by one, leaving only the beat."
  },
  {
    id: "Outro",
    durationMs: 15_000,
    prompt: "Just the kick drum and atmospheric pads, fading into reverb, music slowing down.",
    transitionWindowMs: 0, 
    transitionInstruction: null 
  }
];