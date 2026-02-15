import { 
  lowIntensityInstruments, 
  mediumIntensityInstruments, 
  highIntensityInstruments,
  lowIntensityGenres,
  mediumIntensityGenres,
  highIntensityGenres,
  lowIntensityMoods,
  mediumIntensityMoods,
  highIntensityMoods,
  majorKeys,
  minorKeys,
  percussion,
  base,
  harmony,
  melody
} from "./songInfo.js";

// Helper: Pick 1 random element
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Helper: Pick 'n' unique random elements
const pickMultiple = (arr, n) => {
  // .slice() creates a shallow copy so we don't shuffle the original export
  return [...arr].sort(() => 0.5 - Math.random()).slice(0, n);
};

let activeContext = {
  genre: null,
  instruments: {
    // Original Percussion / FX
    "808 Hip Hop Beat": false,
    "Bongos": false,
    "Drumline": false,
    "Funk Drums": false,
    "Glockenspiel": false,
    "Marimba": false,
    "Nuclear Explosion": false,
    "Steel Drum": false,
    "Timpani": false,

    // Bass
    "Bass Clarinet": false,
    "Cello": false,
    "Didgeridoo": false,
    "Tuba": false,
    "Upright Bass": false,

    // Harmony
    "Accordion": false,
    "Dirty Synths": false,
    "Electric Guitar": false,
    "Electric Piano": false,
    "Flamenco Guitar": false,
    "Guitar": false,
    "Harmonica": false,
    "Harp": false,
    "Harpsichord": false,
    "Moog Oscillations": false,
    "Ragtime Piano": false,
    "Smooth Pianos": false,
    "Spacey Synths": false,
    "Synth Pads": false,
    "Viola Ensemble": false,
    "Warm Acoustic Guitar": false,

    // Melody
    "Alto Saxophone": false,
    "Bagpipes": false,
    "Clarinet": false,
    "Flute": false,
    "French Horn": false,
    "Piccolo": false,
    "Trombone": false,
    "Trumpet": false,
    "Violin": false
  },
  moods: [] 
};

export function handleBioUpdate (packet, conductor){
  if (!conductor) {
    return;
  }

  const { heartRate, galvanicSkinResponse } = packet;

  console.log(`Processing bio data for session: HR: ${heartRate}`);
}

export function handleCameraContext (data) {
  if (data) {
    console.log("Context Received:", data);
    
    activeContext.genre = data.genre || null;
    activeContext.moods = data.moods || [];

    const nextInstruments = { ...DEFAULT_INSTRUMENT_MAP };

    if (data.instruments && Array.isArray(data.instruments)) {
      data.instruments.forEach((instName) => {
        if (nextInstruments.hasOwnProperty(instName)) {
          nextInstruments[instName] = true;
        }
      });
    }

    activeContext.instruments = nextInstruments;
  }
}


export const generateSongPackage = () => {
  const intensity = pick(["low", "med", "high"]);
  const key = pick(majorKeys.concat(minorKeys));
  
  const defaultGenreList = intensity === "low" ? lowIntensityGenres : intensity === "med" ? mediumIntensityGenres : highIntensityGenres;
  const defaultMoodList  = intensity === "low" ? lowIntensityMoods  : intensity === "med" ? mediumIntensityMoods  : highIntensityMoods;
  const defaultInstrList = intensity === "low" ? lowIntensityInstruments : intensity === "med" ? mediumIntensityInstruments : highIntensityInstruments;

  const genre = activeContext.genre ? activeContext.genre : pick(defaultGenreList);

  const activeInstrumentList = Object.keys(activeContext.instruments).filter(
    (key) => activeContext.instruments[key] === true
  );

  const myBass    = activeBand.filter(i => BASS_LIST.includes(i));
  const myHarmony = activeBand.filter(i => HARMONY_LIST.includes(i));
  const myMelody  = activeBand.filter(i => MELODY_LIST.includes(i));

  const getInst = (role) => {
    let pool = [];
    if (role === 'bass') pool = myBass;
    else if (role === 'harmony') pool = myHarmony;
    else if (role === 'melody') pool = myMelody;

    if (pool.length > 0) return pick(pool);
    
    // Fallback: Use whatever the user selected
    if (activeBand.length > 0) return pick(activeBand);
    
    // Safety Net: (Should never happen if logic is sound)
    return "Synthesizer";
  };

  const band = (activeInstrumentList.length > 0) 
    ? activeInstrumentList 
    : pickMultiple(defaultInstrList, 3); 

  const mood = (activeContext.moods && activeContext.moods.length > 0)
    ? pick(activeContext.moods)
    : pick(defaultMoodList);

  const globalContext = `Key: ${key}. Genre: ${genre}. Mood: ${mood}. Instruments: ${band.join(", ")}. BPM: 124. High Fidelity.`;

  const timeline = [
    {
      id: "Intro",
      durationMs: 10_000, 
      prompt: `Atmospheric ${getInst('harmony')}, filtered kick drum, low energy, ${mood} vibe.`,
      transitionWindowMs: 5_000, 
      transitionInstruction: `Slowly opening the filter, introducing ${getInst('melody')} textures.`
    },
    {
      id: "Verse 1",
      durationMs: 15_000,
      prompt: `Full kick drum, crisp hi-hats, ${getInst('harmony')} playing minimal stabs, steady groove.`,
      transitionWindowMs: 4_000,
      transitionInstruction: `Adding a rising white noise sweeper and ${getInst('melody')} riffs to build tension.`
    },
    {
      id: "Build-Up",
      durationMs: 5_000,
      prompt: `No bass, snare roll doubling in speed, rising pitch on the ${getInst('melody')}, high tension.`,
      transitionWindowMs: 1_500,
      transitionInstruction: "A sudden silence for one beat, then a massive impact."
    },
    {
      id: "Chorus (Drop)",
      durationMs: 15_000,
      prompt: `Maximum energy, heavy ${getInst('bass')} bassline, loud clap, main lead melody on ${getInst('melody')} playing full volume.`,
      transitionWindowMs: 5_000,
      transitionInstruction: `Energy fading out, removing the ${getInst('bass')}, simplifying the drums.`
    },
    {
      id: "Interlude",
      durationMs: 10_000,
      prompt: `Stripped back groove, just ${getInst('bass')} and ${getInst('harmony')}, atmospheric vocal chops, spacey reverb.`,
      transitionWindowMs: 3_000,
      transitionInstruction: `Introducing a new melodic element, a ${getInst('melody')} melody.`
    },
    {
      id: "Solo",
      durationMs: 15_000,
      prompt: `Driving beat with a complex, improvised ${getInst('melody')} solo, virtuoso scales, expressive pitch bending.`,
      transitionWindowMs: 5_000,
      transitionInstruction: `The ${getInst('melody')} solo fading into the background, drums becoming sparse.`
    },
    {
      id: "Bridge",
      durationMs: 10_000,
      prompt: `Breakdown, no drums, washing ${getInst('harmony')} chords, emotional and cinematic texture.`,
      transitionWindowMs: 4_000,
      transitionInstruction: `Rapidly building snare roll, rising pitch riser, anticipation for the final drop.`
    },
    {
      id: "Final Chorus",
      durationMs: 15_000,
      prompt: `Explosive energy, euphoric melody on ${getInst('melody')}, driving rhythm, full frequency spectrum.`,
      transitionWindowMs: 5_000,
      transitionInstruction: `Instruments dropping out one by one, leaving only the beat.`
    },
    {
      id: "Outro",
      durationMs: 10_000,
      prompt: `Just the kick drum and ${getInst('bass')}, fading into reverb, music slowing down.`,
      transitionWindowMs: 0, 
      transitionInstruction: null 
    }
  ];

  return { globalContext, timeline };
};