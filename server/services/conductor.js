// ── services/conductor.js ─────────────────────────────────────────────────────
import { generateSongPackage } from "../data/songStructure.js";

export class SongConductor {
  constructor(socket, lyriaSession) {
    this.socket = socket;
    this.lyria = lyriaSession;
    
    // State Tracking
    this.currentIndex = 0;
    this.sectionStartTime = 0;
    this.timer = null;
    
    // Flags to prevent spamming the API
    this.isRunning = false;
    this.isTransitioning = false; 

    const songData = generateSongPackage();

    this.globalContext = songData.globalContext; 
    this.timeline = songData.timeline;
    
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.currentIndex = 0;
    this.sectionStartTime = Date.now();
    
    console.log(`global context: ${this.globalContext}`)
    console.log(`[Conductor] Starting timeline at: ${this.timeline[0].id}`);
    
    // Play the first section immediately
    this.playSection(this.timeline[0]);

    // Start the clock (checks time every 500ms)
    this.timer = setInterval(() => this.tick(), 500);
  }

  stop() {
    this.isRunning = false;
    if (this.timer) clearInterval(this.timer);
    this.lyria.stop();
    console.log("[Conductor] Stopped.");
  }

  // The Heartbeat: Calculates timing and decides what to tell Lyria
  tick() {
    if (!this.isRunning) return;

    const now = Date.now();
    const elapsed = now - this.sectionStartTime;
    const currentSection = this.timeline[this.currentIndex];

    // 1. CHECK FOR END OF SECTION
    if (elapsed >= currentSection.durationMs) {
      this.advanceToNextSection();
      return;
    }

    // 2. CHECK FOR TRANSITION WINDOW
    // If we are close to the end, and haven't triggered the morph yet:
    const timeRemaining = currentSection.durationMs - elapsed;
    const shouldTransition = 
      !this.isTransitioning && 
      currentSection.transitionInstruction && 
      timeRemaining <= currentSection.transitionWindowMs;

    if (shouldTransition) {
      this.triggerTransition(currentSection);
    }
    
    // 3. EMIT PROGRESS (Optional: for your frontend UI bar)
    this.socket.emit("conductorStatus", {
      section: currentSection.id,
      progress: elapsed / currentSection.durationMs,
      state: this.isTransitioning ? "TRANSITIONING" : "GROOVING"
    });
  }

  advanceToNextSection() {
    let nextIndex = this.currentIndex + 1;

    // Check if song is over
    if (nextIndex >= this.timeline.length) {
      console.log("[Conductor] Song finished. Generating NEW song and looping...");
      
      //rerolls everything
      const { globalContext, timeline } = generateSongPackage();
      this.globalContext = globalContext;
      this.timeline = timeline;
      
      nextIndex = 0; 
    }

    // Update State
    this.currentIndex = nextIndex;
    this.sectionStartTime = Date.now();
    this.isTransitioning = false; // Reset flag

    // Play
    const nextSection = this.timeline[this.currentIndex];
    console.log(`[Conductor] Advancing to: ${nextSection.id}`);
    this.playSection(nextSection);
  }

  updateUserSpecs() {
    const { globalContext, timeline } = generateSongPackage();
    this.globalContext = globalContext;
    this.timeline = timeline;
  }

  async playSection(section) {
    // Construct the "Steady State" prompt
    const fullPrompt = `${this.globalContext} ${section.prompt}`;
    
    // Tell frontend we changed sections
    this.socket.emit("sectionChange", { id: section.id, text: section.prompt });

    try {
      await this.lyria.setWeightedPrompts({
        weightedPrompts: [{ text: fullPrompt, weight: 1.0 }]
      });
    } catch (e) {
      console.error("Lyria API Error:", e);
    }
  }

  async triggerTransition(section) {
    this.isTransitioning = true;
    console.log(`[Conductor] Morphing: ${section.transitionInstruction}`);

    // Construct the "Morphing" prompt
    // We combine the CURRENT style with the INSTRUCTION to move forward.
    const transitionPrompt = `${this.globalContext} Currently ${section.prompt} BUT NOW ${section.transitionInstruction}`;

    try {
      await this.lyria.setWeightedPrompts({
        weightedPrompts: [{ text: transitionPrompt, weight: 1.0 }]
      });
    } catch (e) {
      console.error("Lyria API Error:", e);
    }
  }
}