/**
 * Word bank seed data.
 * Populates the word_bank table with 500+ diverse, image-generation-friendly words
 * across 15+ categories. Uses upsert (ON CONFLICT DO NOTHING) to be idempotent.
 *
 * Usage: npm run seed
 */

import dotenv from "dotenv";
dotenv.config();

import { pool, closePool } from "../../config/database";
import type { WordSeedEntry } from "../../models/wordBank";

// ---------------------------------------------------------------------------
// Seed Data — 500+ words across 15+ categories
// ---------------------------------------------------------------------------

const SEED_WORDS: WordSeedEntry[] = [
  // =========================================================================
  // ANIMALS (35 words)
  // =========================================================================
  { word: "octopus", category: "animals" },
  { word: "dragon", category: "animals" },
  { word: "flamingo", category: "animals" },
  { word: "chameleon", category: "animals" },
  { word: "penguin", category: "animals" },
  { word: "wolf", category: "animals" },
  { word: "jellyfish", category: "animals" },
  { word: "phoenix", category: "animals" },
  { word: "sloth", category: "animals" },
  { word: "narwhal", category: "animals" },
  { word: "tarantula", category: "animals" },
  { word: "peacock", category: "animals" },
  { word: "axolotl", category: "animals" },
  { word: "mantis shrimp", category: "animals" },
  { word: "raccoon", category: "animals" },
  { word: "pangolin", category: "animals" },
  { word: "capybara", category: "animals" },
  { word: "pufferfish", category: "animals" },
  { word: "bison", category: "animals" },
  { word: "hummingbird", category: "animals" },
  { word: "iguana", category: "animals" },
  { word: "manatee", category: "animals" },
  { word: "toucan", category: "animals" },
  { word: "scorpion", category: "animals" },
  { word: "walrus", category: "animals" },
  { word: "corgi", category: "animals" },
  { word: "platypus", category: "animals" },
  { word: "seahorse", category: "animals" },
  { word: "parrot", category: "animals" },
  { word: "armadillo", category: "animals" },
  { word: "squid", category: "animals" },
  { word: "gecko", category: "animals" },
  { word: "buffalo", category: "animals" },
  { word: "salamander", category: "animals" },
  { word: "crab", category: "animals" },

  // =========================================================================
  // MYTHICAL CREATURES (25 words)
  // =========================================================================
  { word: "unicorn", category: "mythical creatures" },
  { word: "kraken", category: "mythical creatures" },
  { word: "griffin", category: "mythical creatures" },
  { word: "minotaur", category: "mythical creatures" },
  { word: "chimera", category: "mythical creatures" },
  { word: "centaur", category: "mythical creatures" },
  { word: "hydra", category: "mythical creatures" },
  { word: "sphinx", category: "mythical creatures" },
  { word: "basilisk", category: "mythical creatures" },
  { word: "yeti", category: "mythical creatures" },
  { word: "pegasus", category: "mythical creatures" },
  { word: "mermaid", category: "mythical creatures" },
  { word: "cyclops", category: "mythical creatures" },
  { word: "goblin", category: "mythical creatures" },
  { word: "fairy", category: "mythical creatures" },
  { word: "werewolf", category: "mythical creatures" },
  { word: "gorgon", category: "mythical creatures" },
  { word: "banshee", category: "mythical creatures" },
  { word: "thunderbird", category: "mythical creatures" },
  { word: "leprechaun", category: "mythical creatures" },
  { word: "djinn", category: "mythical creatures" },
  { word: "golem", category: "mythical creatures" },
  { word: "gargoyle", category: "mythical creatures" },
  { word: "leviathan", category: "mythical creatures" },
  { word: "kitsune", category: "mythical creatures" },

  // =========================================================================
  // OBJECTS (40 words)
  // =========================================================================
  { word: "lighthouse", category: "objects" },
  { word: "violin", category: "objects" },
  { word: "telescope", category: "objects" },
  { word: "hourglass", category: "objects" },
  { word: "chandelier", category: "objects" },
  { word: "typewriter", category: "objects" },
  { word: "compass", category: "objects" },
  { word: "gramophone", category: "objects" },
  { word: "submarine", category: "objects" },
  { word: "balloon", category: "objects" },
  { word: "umbrella", category: "objects" },
  { word: "lantern", category: "objects" },
  { word: "microscope", category: "objects" },
  { word: "crystal ball", category: "objects" },
  { word: "treasure chest", category: "objects" },
  { word: "music box", category: "objects" },
  { word: "catapult", category: "objects" },
  { word: "candelabra", category: "objects" },
  { word: "snow globe", category: "objects" },
  { word: "kaleidoscope", category: "objects" },
  { word: "guillotine", category: "objects" },
  { word: "sundial", category: "objects" },
  { word: "birdcage", category: "objects" },
  { word: "cannon", category: "objects" },
  { word: "anchor", category: "objects" },
  { word: "throne", category: "objects" },
  { word: "monocle", category: "objects" },
  { word: "trampoline", category: "objects" },
  { word: "harmonica", category: "objects" },
  { word: "cauldron", category: "objects" },
  { word: "pendulum", category: "objects" },
  { word: "sarcophagus", category: "objects" },
  { word: "lava lamp", category: "objects" },
  { word: "boomerang", category: "objects" },
  { word: "metronome", category: "objects" },
  { word: "magnifying glass", category: "objects" },
  { word: "accordion", category: "objects" },
  { word: "pinball machine", category: "objects" },
  { word: "hammock", category: "objects" },
  { word: "gyroscope", category: "objects" },

  // =========================================================================
  // ACTIONS (40 words)
  // =========================================================================
  { word: "dancing", category: "actions" },
  { word: "flying", category: "actions" },
  { word: "melting", category: "actions" },
  { word: "exploding", category: "actions" },
  { word: "juggling", category: "actions" },
  { word: "surfing", category: "actions" },
  { word: "levitating", category: "actions" },
  { word: "wrestling", category: "actions" },
  { word: "skateboarding", category: "actions" },
  { word: "sleepwalking", category: "actions" },
  { word: "crumbling", category: "actions" },
  { word: "erupting", category: "actions" },
  { word: "dissolving", category: "actions" },
  { word: "somersaulting", category: "actions" },
  { word: "yodeling", category: "actions" },
  { word: "moonwalking", category: "actions" },
  { word: "hibernating", category: "actions" },
  { word: "sizzling", category: "actions" },
  { word: "breakdancing", category: "actions" },
  { word: "teleporting", category: "actions" },
  { word: "stampeding", category: "actions" },
  { word: "parachuting", category: "actions" },
  { word: "meditating", category: "actions" },
  { word: "parkour", category: "actions" },
  { word: "conducting", category: "actions" },
  { word: "ice skating", category: "actions" },
  { word: "arm wrestling", category: "actions" },
  { word: "jousting", category: "actions" },
  { word: "tightrope walking", category: "actions" },
  { word: "photobombing", category: "actions" },
  { word: "beatboxing", category: "actions" },
  { word: "sword fighting", category: "actions" },
  { word: "crowd surfing", category: "actions" },
  { word: "bungee jumping", category: "actions" },
  { word: "tap dancing", category: "actions" },
  { word: "skydiving", category: "actions" },
  { word: "karate chopping", category: "actions" },
  { word: "limbo dancing", category: "actions" },
  { word: "swimming", category: "actions" },
  { word: "climbing", category: "actions" },

  // =========================================================================
  // ADJECTIVES (40 words)
  // =========================================================================
  { word: "tiny", category: "adjectives" },
  { word: "ancient", category: "adjectives" },
  { word: "crystalline", category: "adjectives" },
  { word: "floating", category: "adjectives" },
  { word: "gigantic", category: "adjectives" },
  { word: "melancholic", category: "adjectives" },
  { word: "invisible", category: "adjectives" },
  { word: "radioactive", category: "adjectives" },
  { word: "furious", category: "adjectives" },
  { word: "translucent", category: "adjectives" },
  { word: "bewildered", category: "adjectives" },
  { word: "prehistoric", category: "adjectives" },
  { word: "majestic", category: "adjectives" },
  { word: "haunted", category: "adjectives" },
  { word: "glowing", category: "adjectives" },
  { word: "rusty", category: "adjectives" },
  { word: "colossal", category: "adjectives" },
  { word: "frozen", category: "adjectives" },
  { word: "enchanted", category: "adjectives" },
  { word: "steampunk", category: "adjectives" },
  { word: "cybernetic", category: "adjectives" },
  { word: "overgrown", category: "adjectives" },
  { word: "wobbly", category: "adjectives" },
  { word: "iridescent", category: "adjectives" },
  { word: "miniature", category: "adjectives" },
  { word: "enormous", category: "adjectives" },
  { word: "ethereal", category: "adjectives" },
  { word: "volcanic", category: "adjectives" },
  { word: "sparkling", category: "adjectives" },
  { word: "decrepit", category: "adjectives" },
  { word: "mechanical", category: "adjectives" },
  { word: "sentient", category: "adjectives" },
  { word: "inflatable", category: "adjectives" },
  { word: "fossilized", category: "adjectives" },
  { word: "upside-down", category: "adjectives" },
  { word: "kaleidoscopic", category: "adjectives" },
  { word: "grumpy", category: "adjectives" },
  { word: "hypnotic", category: "adjectives" },
  { word: "magnetic", category: "adjectives" },
  { word: "bedazzled", category: "adjectives" },

  // =========================================================================
  // SETTINGS / PLACES (35 words)
  // =========================================================================
  { word: "underwater", category: "settings" },
  { word: "space", category: "settings" },
  { word: "forest", category: "settings" },
  { word: "volcano", category: "settings" },
  { word: "cityscape", category: "settings" },
  { word: "desert", category: "settings" },
  { word: "arctic tundra", category: "settings" },
  { word: "dungeon", category: "settings" },
  { word: "rooftop", category: "settings" },
  { word: "library", category: "settings" },
  { word: "train station", category: "settings" },
  { word: "graveyard", category: "settings" },
  { word: "coral reef", category: "settings" },
  { word: "colosseum", category: "settings" },
  { word: "moonscape", category: "settings" },
  { word: "swamp", category: "settings" },
  { word: "casino", category: "settings" },
  { word: "throne room", category: "settings" },
  { word: "jungle", category: "settings" },
  { word: "laboratory", category: "settings" },
  { word: "underground cave", category: "settings" },
  { word: "cloud kingdom", category: "settings" },
  { word: "pirate ship", category: "settings" },
  { word: "medieval castle", category: "settings" },
  { word: "neon city", category: "settings" },
  { word: "ancient ruins", category: "settings" },
  { word: "candy land", category: "settings" },
  { word: "haunted mansion", category: "settings" },
  { word: "space station", category: "settings" },
  { word: "bamboo forest", category: "settings" },
  { word: "floating island", category: "settings" },
  { word: "ice palace", category: "settings" },
  { word: "junkyard", category: "settings" },
  { word: "amphitheater", category: "settings" },
  { word: "bazaar", category: "settings" },

  // =========================================================================
  // FOODS (30 words)
  // =========================================================================
  { word: "spaghetti", category: "foods" },
  { word: "pizza", category: "foods" },
  { word: "sushi", category: "foods" },
  { word: "taco", category: "foods" },
  { word: "waffle", category: "foods" },
  { word: "donut", category: "foods" },
  { word: "burrito", category: "foods" },
  { word: "croissant", category: "foods" },
  { word: "pineapple", category: "foods" },
  { word: "watermelon", category: "foods" },
  { word: "pretzel", category: "foods" },
  { word: "cupcake", category: "foods" },
  { word: "dumpling", category: "foods" },
  { word: "fondue", category: "foods" },
  { word: "avocado", category: "foods" },
  { word: "pancake", category: "foods" },
  { word: "popcorn", category: "foods" },
  { word: "ramen", category: "foods" },
  { word: "baguette", category: "foods" },
  { word: "cheesecake", category: "foods" },
  { word: "cotton candy", category: "foods" },
  { word: "chili pepper", category: "foods" },
  { word: "ice cream sundae", category: "foods" },
  { word: "gummy bear", category: "foods" },
  { word: "fortune cookie", category: "foods" },
  { word: "chocolate fountain", category: "foods" },
  { word: "cinnamon roll", category: "foods" },
  { word: "macaron", category: "foods" },
  { word: "nachos", category: "foods" },
  { word: "lobster", category: "foods" },

  // =========================================================================
  // EMOTIONS (25 words)
  // =========================================================================
  { word: "euphoric", category: "emotions" },
  { word: "terrified", category: "emotions" },
  { word: "contemplative", category: "emotions" },
  { word: "ecstatic", category: "emotions" },
  { word: "nostalgic", category: "emotions" },
  { word: "confused", category: "emotions" },
  { word: "triumphant", category: "emotions" },
  { word: "dramatic", category: "emotions" },
  { word: "suspicious", category: "emotions" },
  { word: "panic-stricken", category: "emotions" },
  { word: "awestruck", category: "emotions" },
  { word: "mischievous", category: "emotions" },
  { word: "serene", category: "emotions" },
  { word: "indignant", category: "emotions" },
  { word: "wistful", category: "emotions" },
  { word: "determined", category: "emotions" },
  { word: "delirious", category: "emotions" },
  { word: "smug", category: "emotions" },
  { word: "exasperated", category: "emotions" },
  { word: "zen", category: "emotions" },
  { word: "brooding", category: "emotions" },
  { word: "giddy", category: "emotions" },
  { word: "flabbergasted", category: "emotions" },
  { word: "vengeful", category: "emotions" },
  { word: "lovesick", category: "emotions" },

  // =========================================================================
  // WEATHER (20 words)
  // =========================================================================
  { word: "thunderstorm", category: "weather" },
  { word: "tornado", category: "weather" },
  { word: "blizzard", category: "weather" },
  { word: "rainbow", category: "weather" },
  { word: "aurora borealis", category: "weather" },
  { word: "monsoon", category: "weather" },
  { word: "hailstorm", category: "weather" },
  { word: "solar eclipse", category: "weather" },
  { word: "fog", category: "weather" },
  { word: "sandstorm", category: "weather" },
  { word: "lightning", category: "weather" },
  { word: "avalanche", category: "weather" },
  { word: "meteor shower", category: "weather" },
  { word: "tsunami", category: "weather" },
  { word: "whirlpool", category: "weather" },
  { word: "heat wave", category: "weather" },
  { word: "frost", category: "weather" },
  { word: "acid rain", category: "weather" },
  { word: "dust devil", category: "weather" },
  { word: "supernova", category: "weather" },

  // =========================================================================
  // COLORS (25 words)
  // =========================================================================
  { word: "crimson", category: "colors" },
  { word: "azure", category: "colors" },
  { word: "emerald", category: "colors" },
  { word: "golden", category: "colors" },
  { word: "neon pink", category: "colors" },
  { word: "obsidian", category: "colors" },
  { word: "turquoise", category: "colors" },
  { word: "magenta", category: "colors" },
  { word: "lavender", category: "colors" },
  { word: "amber", category: "colors" },
  { word: "cobalt", category: "colors" },
  { word: "scarlet", category: "colors" },
  { word: "chartreuse", category: "colors" },
  { word: "indigo", category: "colors" },
  { word: "platinum", category: "colors" },
  { word: "vermillion", category: "colors" },
  { word: "burgundy", category: "colors" },
  { word: "teal", category: "colors" },
  { word: "bronze", category: "colors" },
  { word: "silver", category: "colors" },
  { word: "copper", category: "colors" },
  { word: "ivory", category: "colors" },
  { word: "midnight blue", category: "colors" },
  { word: "electric purple", category: "colors" },
  { word: "holographic", category: "colors" },

  // =========================================================================
  // PROFESSIONS (30 words)
  // =========================================================================
  { word: "astronaut", category: "professions" },
  { word: "pirate", category: "professions" },
  { word: "wizard", category: "professions" },
  { word: "samurai", category: "professions" },
  { word: "gladiator", category: "professions" },
  { word: "chef", category: "professions" },
  { word: "detective", category: "professions" },
  { word: "cowboy", category: "professions" },
  { word: "ninja", category: "professions" },
  { word: "blacksmith", category: "professions" },
  { word: "archaeologist", category: "professions" },
  { word: "mad scientist", category: "professions" },
  { word: "court jester", category: "professions" },
  { word: "viking", category: "professions" },
  { word: "pharaoh", category: "professions" },
  { word: "knight", category: "professions" },
  { word: "lumberjack", category: "professions" },
  { word: "alchemist", category: "professions" },
  { word: "ringmaster", category: "professions" },
  { word: "bounty hunter", category: "professions" },
  { word: "beekeeper", category: "professions" },
  { word: "gondolier", category: "professions" },
  { word: "puppeteer", category: "professions" },
  { word: "fortune teller", category: "professions" },
  { word: "sorcerer", category: "professions" },
  { word: "cartographer", category: "professions" },
  { word: "shaman", category: "professions" },
  { word: "chimney sweep", category: "professions" },
  { word: "deep sea diver", category: "professions" },

  // =========================================================================
  // VEHICLES (25 words)
  // =========================================================================
  { word: "hot air balloon", category: "vehicles" },
  { word: "rocket ship", category: "vehicles" },
  { word: "flying carpet", category: "vehicles" },
  { word: "steam locomotive", category: "vehicles" },
  { word: "unicycle", category: "vehicles" },
  { word: "zeppelin", category: "vehicles" },
  { word: "chariot", category: "vehicles" },
  { word: "kayak", category: "vehicles" },
  { word: "hovercraft", category: "vehicles" },
  { word: "penny-farthing", category: "vehicles" },
  { word: "monster truck", category: "vehicles" },
  { word: "gondola", category: "vehicles" },
  { word: "bumper car", category: "vehicles" },
  { word: "catamaran", category: "vehicles" },
  { word: "toboggan", category: "vehicles" },
  { word: "rickshaw", category: "vehicles" },
  { word: "stagecoach", category: "vehicles" },
  { word: "hang glider", category: "vehicles" },
  { word: "jet ski", category: "vehicles" },
  { word: "zamboni", category: "vehicles" },
  { word: "shopping cart", category: "vehicles" },
  { word: "canoe", category: "vehicles" },
  { word: "roller coaster", category: "vehicles" },
  { word: "sled", category: "vehicles" },
  { word: "tank", category: "vehicles" },

  // =========================================================================
  // BODY PARTS (20 words)
  // =========================================================================
  { word: "tentacles", category: "body parts" },
  { word: "antlers", category: "body parts" },
  { word: "wings", category: "body parts" },
  { word: "claws", category: "body parts" },
  { word: "tusks", category: "body parts" },
  { word: "tail", category: "body parts" },
  { word: "horns", category: "body parts" },
  { word: "eyeball", category: "body parts" },
  { word: "mustache", category: "body parts" },
  { word: "fangs", category: "body parts" },
  { word: "scales", category: "body parts" },
  { word: "feathers", category: "body parts" },
  { word: "skeleton", category: "body parts" },
  { word: "third eye", category: "body parts" },
  { word: "extra arms", category: "body parts" },
  { word: "paws", category: "body parts" },
  { word: "gills", category: "body parts" },
  { word: "beak", category: "body parts" },
  { word: "mane", category: "body parts" },
  { word: "snout", category: "body parts" },

  // =========================================================================
  // MATERIALS (20 words)
  // =========================================================================
  { word: "diamond", category: "materials" },
  { word: "lava", category: "materials" },
  { word: "crystal", category: "materials" },
  { word: "jelly", category: "materials" },
  { word: "marble", category: "materials" },
  { word: "bubblegum", category: "materials" },
  { word: "obsidian glass", category: "materials" },
  { word: "driftwood", category: "materials" },
  { word: "stained glass", category: "materials" },
  { word: "origami paper", category: "materials" },
  { word: "neon tubes", category: "materials" },
  { word: "coral", category: "materials" },
  { word: "smoke", category: "materials" },
  { word: "slime", category: "materials" },
  { word: "quicksand", category: "materials" },
  { word: "silk", category: "materials" },
  { word: "titanium", category: "materials" },
  { word: "porcelain", category: "materials" },
  { word: "molten gold", category: "materials" },
  { word: "ice", category: "materials" },

  // =========================================================================
  // ABSTRACT CONCEPTS (25 words)
  // =========================================================================
  { word: "time travel", category: "abstract concepts" },
  { word: "gravity", category: "abstract concepts" },
  { word: "dreams", category: "abstract concepts" },
  { word: "chaos", category: "abstract concepts" },
  { word: "infinity", category: "abstract concepts" },
  { word: "parallel universe", category: "abstract concepts" },
  { word: "deja vu", category: "abstract concepts" },
  { word: "illusion", category: "abstract concepts" },
  { word: "evolution", category: "abstract concepts" },
  { word: "paradox", category: "abstract concepts" },
  { word: "metamorphosis", category: "abstract concepts" },
  { word: "entropy", category: "abstract concepts" },
  { word: "singularity", category: "abstract concepts" },
  { word: "prophecy", category: "abstract concepts" },
  { word: "telepathy", category: "abstract concepts" },
  { word: "quantum leap", category: "abstract concepts" },
  { word: "nostalgia", category: "abstract concepts" },
  { word: "synesthesia", category: "abstract concepts" },
  { word: "serendipity", category: "abstract concepts" },
  { word: "vertigo", category: "abstract concepts" },
  { word: "renaissance", category: "abstract concepts" },
  { word: "rebellion", category: "abstract concepts" },
  { word: "utopia", category: "abstract concepts" },
  { word: "oblivion", category: "abstract concepts" },
  { word: "transcendence", category: "abstract concepts" },

  // =========================================================================
  // STYLES (25 words)
  // =========================================================================
  { word: "watercolor", category: "styles" },
  { word: "pixel art", category: "styles" },
  { word: "oil painting", category: "styles" },
  { word: "neon", category: "styles" },
  { word: "vaporwave", category: "styles" },
  { word: "art deco", category: "styles" },
  { word: "gothic", category: "styles" },
  { word: "baroque", category: "styles" },
  { word: "pop art", category: "styles" },
  { word: "ukiyo-e", category: "styles" },
  { word: "psychedelic", category: "styles" },
  { word: "brutalist", category: "styles" },
  { word: "impressionist", category: "styles" },
  { word: "surrealist", category: "styles" },
  { word: "cubist", category: "styles" },
  { word: "retro-futuristic", category: "styles" },
  { word: "noir", category: "styles" },
  { word: "cel-shaded", category: "styles" },
  { word: "mosaic", category: "styles" },
  { word: "low poly", category: "styles" },
  { word: "art nouveau", category: "styles" },
  { word: "isometric", category: "styles" },
  { word: "woodblock print", category: "styles" },
  { word: "glitch art", category: "styles" },
  { word: "pointillism", category: "styles" },

  // =========================================================================
  // TIME PERIODS (20 words)
  // =========================================================================
  { word: "medieval", category: "time periods" },
  { word: "Neolithic", category: "time periods" },
  { word: "futuristic", category: "time periods" },
  { word: "Victorian", category: "time periods" },
  { word: "1980s", category: "time periods" },
  { word: "ancient Egyptian", category: "time periods" },
  { word: "Wild West", category: "time periods" },
  { word: "Stone Age", category: "time periods" },
  { word: "cyberpunk", category: "time periods" },
  { word: "Jurassic", category: "time periods" },
  { word: "Renaissance era", category: "time periods" },
  { word: "post-apocalyptic", category: "time periods" },
  { word: "Ice Age", category: "time periods" },
  { word: "Roaring Twenties", category: "time periods" },
  { word: "space age", category: "time periods" },
  { word: "Bronze Age", category: "time periods" },
  { word: "disco era", category: "time periods" },
  { word: "prohibition era", category: "time periods" },
  { word: "ancient Roman", category: "time periods" },
  { word: "steampunk era", category: "time periods" },

  // =========================================================================
  // MUSICAL INSTRUMENTS (20 words)
  // =========================================================================
  { word: "bagpipes", category: "musical instruments" },
  { word: "banjo", category: "musical instruments" },
  { word: "theremin", category: "musical instruments" },
  { word: "didgeridoo", category: "musical instruments" },
  { word: "xylophone", category: "musical instruments" },
  { word: "tuba", category: "musical instruments" },
  { word: "electric guitar", category: "musical instruments" },
  { word: "harp", category: "musical instruments" },
  { word: "drums", category: "musical instruments" },
  { word: "pipe organ", category: "musical instruments" },
  { word: "saxophone", category: "musical instruments" },
  { word: "tambourine", category: "musical instruments" },
  { word: "maracas", category: "musical instruments" },
  { word: "cello", category: "musical instruments" },
  { word: "triangle", category: "musical instruments" },
  { word: "kazoo", category: "musical instruments" },
  { word: "ukulele", category: "musical instruments" },
  { word: "cowbell", category: "musical instruments" },
  { word: "pan flute", category: "musical instruments" },
  { word: "synthesizer", category: "musical instruments" },

  // =========================================================================
  // NATURE (25 words)
  // =========================================================================
  { word: "mushroom", category: "nature" },
  { word: "cactus", category: "nature" },
  { word: "bonsai tree", category: "nature" },
  { word: "venus flytrap", category: "nature" },
  { word: "kelp forest", category: "nature" },
  { word: "redwood tree", category: "nature" },
  { word: "sunflower", category: "nature" },
  { word: "stalagmite", category: "nature" },
  { word: "geyser", category: "nature" },
  { word: "waterfall", category: "nature" },
  { word: "glacier", category: "nature" },
  { word: "tumbleweed", category: "nature" },
  { word: "lotus flower", category: "nature" },
  { word: "crystal cave", category: "nature" },
  { word: "giant sequoia", category: "nature" },
  { word: "vine", category: "nature" },
  { word: "tide pool", category: "nature" },
  { word: "meteor", category: "nature" },
  { word: "aurora", category: "nature" },
  { word: "tidal wave", category: "nature" },
  { word: "icicle", category: "nature" },
  { word: "fossil", category: "nature" },
  { word: "volcanic rock", category: "nature" },
  { word: "whirlwind", category: "nature" },
  { word: "mangrove", category: "nature" },
];

// ---------------------------------------------------------------------------
// Seed function
// ---------------------------------------------------------------------------

/**
 * Seed the word_bank table with curated words.
 * Uses INSERT ... ON CONFLICT DO NOTHING for idempotent re-seeding.
 */
export async function seedWordBank(): Promise<{ inserted: number; total: number }> {
  console.log(`[seed] Seeding word bank with ${SEED_WORDS.length} words...`);

  const client = await pool.connect();
  let inserted = 0;

  try {
    await client.query("BEGIN");

    for (const entry of SEED_WORDS) {
      const result = await client.query(
        `INSERT INTO word_bank (word, category)
         VALUES ($1, $2)
         ON CONFLICT (word) DO NOTHING`,
        [entry.word, entry.category]
      );
      if (result.rowCount && result.rowCount > 0) {
        inserted++;
      }
    }

    await client.query("COMMIT");

    // Get total count
    const countResult = await client.query("SELECT COUNT(*) FROM word_bank");
    const total = parseInt(countResult.rows[0].count, 10);

    console.log(`[seed] Inserted ${inserted} new words. Total in bank: ${total}`);
    return { inserted, total };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** Export the seed data for testing and validation. */
export { SEED_WORDS };

// ---------------------------------------------------------------------------
// CLI runner
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  try {
    const { inserted, total } = await seedWordBank();

    // Report category breakdown
    const categories = new Map<string, number>();
    for (const entry of SEED_WORDS) {
      categories.set(entry.category, (categories.get(entry.category) || 0) + 1);
    }
    console.log(`[seed] Categories (${categories.size}):`);
    for (const [cat, count] of categories.entries()) {
      console.log(`  - ${cat}: ${count} words`);
    }

    console.log(`\n[seed] Done. ${inserted} new words inserted, ${total} total in database.`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[seed] Seed failed:", message);
    process.exit(1);
  } finally {
    await closePool();
  }
}

main();
