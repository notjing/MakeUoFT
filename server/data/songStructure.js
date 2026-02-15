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
  minorKeys
} from "./songInfo.js";

// Helper: Pick 1 random element
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Helper: Pick 'n' unique random elements
const pickMultiple = (arr, n) => {
  // .slice() creates a shallow copy so we don't shuffle the original export
  return [...arr].sort(() => 0.5 - Math.random()).slice(0, n);
};

function handleBioUpdate (packet, conductor){
  if (!conductor) {
    return;
  }

  const { heartRate, galvanicSkinResponse } = packet;

  console.log(`Processing bio data for session: HR: ${heartRate}`);


}


export const generateSongPackage = () => {
  const intensity = pick(["low", "med", "high"]);
  const key = pick(majorKeys.concat(minorKeys));
  
  const genreList = intensity === "low" ? lowIntensityGenres : intensity === "med" ? mediumIntensityGenres : highIntensityGenres;
  const moodList  = intensity === "low" ? lowIntensityMoods  : intensity === "med" ? mediumIntensityMoods  : highIntensityMoods;
  const instrList = intensity === "low" ? lowIntensityInstruments : intensity === "med" ? mediumIntensityInstruments : highIntensityInstruments;

  const genre = pick(genreList);
  const mood  = pick(moodList);

  const band = pickMultiple(instrList, 5); 

  const globalContext = `Key: ${key}. Genre: ${genre}. Mood: ${mood}. Instruments: ${band.join(", ")}. BPM: 124. High Fidelity.`;

  const timeline = [
    {
      id: "Intro",
      durationMs: 10_000, 
      prompt: `Atmospheric ${pick(band)}, filtered kick drum, low energy, ${pick(moodList)}.`,
      transitionWindowMs: 5_000, 
      transitionInstruction: `Slowly opening the filter, introducing ${pick(band)} textures.`
    },
    {
      id: "Verse 1",
      durationMs: 15_000,
      prompt: `Full kick drum, crisp hi-hats, ${pick(band)} playing minimal stabs, steady groove.`,
      transitionWindowMs: 4_000,
      transitionInstruction: `Adding a rising white noise sweeper and ${pick(band)} riffs to build tension.`
    },
    {
      id: "Build-Up",
      durationMs: 5_000,
      prompt: `No bass, snare roll doubling in speed, rising pitch on the ${pick(band)}, high tension.`,
      transitionWindowMs: 1_500,
      transitionInstruction: "A sudden silence for one beat, then a massive impact."
    },
    {
      id: "Chorus (Drop)",
      durationMs: 15_000,
      prompt: `Maximum energy, heavy bassline, loud clap, main lead melody on ${pick(band)} playing full volume.`,
      transitionWindowMs: 5_000,
      transitionInstruction: `Energy fading out, removing the ${pick(band)}, simplifying the drums.`
    },
    {
      id: "Interlude",
      durationMs: 10_000,
      prompt: `Stripped back groove, just bass and ${pick(band)}, atmospheric vocal chops, spacey reverb.`,
      transitionWindowMs: 3_000,
      transitionInstruction: `Introducing a new melodic element, a ${pick(band)} melody.`
    },
    {
      id: "Solo",
      durationMs: 15_000,
      prompt: `Driving beat with a complex, improvised ${pick(band)} solo, virtuoso scales, expressive pitch bending.`,
      transitionWindowMs: 5_000,
      transitionInstruction: `The ${pick(band)} solo fading into the background, drums becoming sparse.`
    },
    {
      id: "Bridge",
      durationMs: 10_000,
      prompt: `Breakdown, no drums, washing ${pick(band)} chords, emotional and cinematic texture.`,
      transitionWindowMs: 4_000,
      transitionInstruction: `Rapidly building snare roll, rising pitch riser, anticipation for the final drop.`
    },
    {
      id: "Final Chorus",
      durationMs: 15_000,
      prompt: `Explosive energy, euphoric melody on ${pick(band)}, driving rhythm, full frequency spectrum.`,
      transitionWindowMs: 5_000,
      transitionInstruction: `Instruments dropping out one by one, leaving only the beat.`
    },
    {
      id: "Outro",
      durationMs: 10_000,
      prompt: `Just the kick drum and ${pick(band)}, fading into reverb, music slowing down.`,
      transitionWindowMs: 0, 
      transitionInstruction: null 
    }
  ];

  return { globalContext, timeline };
};