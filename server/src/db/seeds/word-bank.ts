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
  // ANIMALS (40 words) — common, recognizable animals
  // =========================================================================
  { word: "cat", category: "animals" },
  { word: "dog", category: "animals" },
  { word: "elephant", category: "animals" },
  { word: "whale", category: "animals" },
  { word: "penguin", category: "animals" },
  { word: "frog", category: "animals" },
  { word: "bear", category: "animals" },
  { word: "horse", category: "animals" },
  { word: "cow", category: "animals" },
  { word: "pig", category: "animals" },
  { word: "chicken", category: "animals" },
  { word: "duck", category: "animals" },
  { word: "monkey", category: "animals" },
  { word: "giraffe", category: "animals" },
  { word: "lion", category: "animals" },
  { word: "tiger", category: "animals" },
  { word: "shark", category: "animals" },
  { word: "dolphin", category: "animals" },
  { word: "turtle", category: "animals" },
  { word: "rabbit", category: "animals" },
  { word: "snake", category: "animals" },
  { word: "owl", category: "animals" },
  { word: "eagle", category: "animals" },
  { word: "parrot", category: "animals" },
  { word: "octopus", category: "animals" },
  { word: "jellyfish", category: "animals" },
  { word: "flamingo", category: "animals" },
  { word: "corgi", category: "animals" },
  { word: "panda", category: "animals" },
  { word: "koala", category: "animals" },
  { word: "raccoon", category: "animals" },
  { word: "squirrel", category: "animals" },
  { word: "deer", category: "animals" },
  { word: "hamster", category: "animals" },
  { word: "goldfish", category: "animals" },
  { word: "crab", category: "animals" },
  { word: "butterfly", category: "animals" },
  { word: "bee", category: "animals" },
  { word: "snail", category: "animals" },
  { word: "goat", category: "animals" },

  // =========================================================================
  // OBJECTS (40 words) — everyday items anyone would recognize
  // =========================================================================
  { word: "umbrella", category: "objects" },
  { word: "guitar", category: "objects" },
  { word: "bicycle", category: "objects" },
  { word: "skateboard", category: "objects" },
  { word: "chair", category: "objects" },
  { word: "lamp", category: "objects" },
  { word: "clock", category: "objects" },
  { word: "mirror", category: "objects" },
  { word: "book", category: "objects" },
  { word: "hat", category: "objects" },
  { word: "crown", category: "objects" },
  { word: "sword", category: "objects" },
  { word: "telescope", category: "objects" },
  { word: "camera", category: "objects" },
  { word: "ladder", category: "objects" },
  { word: "balloon", category: "objects" },
  { word: "bucket", category: "objects" },
  { word: "key", category: "objects" },
  { word: "shovel", category: "objects" },
  { word: "broom", category: "objects" },
  { word: "candle", category: "objects" },
  { word: "trophy", category: "objects" },
  { word: "flag", category: "objects" },
  { word: "kite", category: "objects" },
  { word: "backpack", category: "objects" },
  { word: "paintbrush", category: "objects" },
  { word: "fishing rod", category: "objects" },
  { word: "watering can", category: "objects" },
  { word: "megaphone", category: "objects" },
  { word: "microphone", category: "objects" },
  { word: "trampoline", category: "objects" },
  { word: "treasure chest", category: "objects" },
  { word: "magnifying glass", category: "objects" },
  { word: "shopping cart", category: "objects" },
  { word: "wheelbarrow", category: "objects" },
  { word: "bathtub", category: "objects" },
  { word: "piano", category: "objects" },
  { word: "phone", category: "objects" },
  { word: "toilet", category: "objects" },
  { word: "bed", category: "objects" },

  // =========================================================================
  // FOODS (30 words) — universally known foods
  // =========================================================================
  { word: "pizza", category: "foods" },
  { word: "ice cream", category: "foods" },
  { word: "banana", category: "foods" },
  { word: "cake", category: "foods" },
  { word: "donut", category: "foods" },
  { word: "hamburger", category: "foods" },
  { word: "hot dog", category: "foods" },
  { word: "sandwich", category: "foods" },
  { word: "spaghetti", category: "foods" },
  { word: "taco", category: "foods" },
  { word: "cookie", category: "foods" },
  { word: "watermelon", category: "foods" },
  { word: "pineapple", category: "foods" },
  { word: "apple", category: "foods" },
  { word: "cupcake", category: "foods" },
  { word: "pancake", category: "foods" },
  { word: "waffle", category: "foods" },
  { word: "popcorn", category: "foods" },
  { word: "french fries", category: "foods" },
  { word: "sushi", category: "foods" },
  { word: "burrito", category: "foods" },
  { word: "pretzel", category: "foods" },
  { word: "lollipop", category: "foods" },
  { word: "cotton candy", category: "foods" },
  { word: "cheese", category: "foods" },
  { word: "bread", category: "foods" },
  { word: "avocado", category: "foods" },
  { word: "cherry", category: "foods" },
  { word: "coconut", category: "foods" },
  { word: "egg", category: "foods" },

  // =========================================================================
  // ACTIONS (35 words) — simple, visual verbs
  // =========================================================================
  { word: "riding", category: "actions" },
  { word: "eating", category: "actions" },
  { word: "dancing", category: "actions" },
  { word: "flying", category: "actions" },
  { word: "sleeping", category: "actions" },
  { word: "juggling", category: "actions" },
  { word: "surfing", category: "actions" },
  { word: "painting", category: "actions" },
  { word: "cooking", category: "actions" },
  { word: "singing", category: "actions" },
  { word: "swimming", category: "actions" },
  { word: "jumping", category: "actions" },
  { word: "running", category: "actions" },
  { word: "climbing", category: "actions" },
  { word: "fishing", category: "actions" },
  { word: "skiing", category: "actions" },
  { word: "skating", category: "actions" },
  { word: "reading", category: "actions" },
  { word: "driving", category: "actions" },
  { word: "wrestling", category: "actions" },
  { word: "diving", category: "actions" },
  { word: "skateboarding", category: "actions" },
  { word: "bowling", category: "actions" },
  { word: "throwing", category: "actions" },
  { word: "catching", category: "actions" },
  { word: "chasing", category: "actions" },
  { word: "hiding", category: "actions" },
  { word: "sliding", category: "actions" },
  { word: "balancing", category: "actions" },
  { word: "spinning", category: "actions" },
  { word: "digging", category: "actions" },
  { word: "building", category: "actions" },
  { word: "playing", category: "actions" },
  { word: "waving", category: "actions" },
  { word: "melting", category: "actions" },

  // =========================================================================
  // ADJECTIVES (30 words) — simple, visual descriptors
  // =========================================================================
  { word: "giant", category: "adjectives" },
  { word: "tiny", category: "adjectives" },
  { word: "purple", category: "adjectives" },
  { word: "golden", category: "adjectives" },
  { word: "fluffy", category: "adjectives" },
  { word: "old", category: "adjectives" },
  { word: "shiny", category: "adjectives" },
  { word: "broken", category: "adjectives" },
  { word: "floating", category: "adjectives" },
  { word: "frozen", category: "adjectives" },
  { word: "upside-down", category: "adjectives" },
  { word: "rainbow", category: "adjectives" },
  { word: "invisible", category: "adjectives" },
  { word: "glowing", category: "adjectives" },
  { word: "rusty", category: "adjectives" },
  { word: "wooden", category: "adjectives" },
  { word: "rubber", category: "adjectives" },
  { word: "sleepy", category: "adjectives" },
  { word: "angry", category: "adjectives" },
  { word: "confused", category: "adjectives" },
  { word: "scared", category: "adjectives" },
  { word: "happy", category: "adjectives" },
  { word: "grumpy", category: "adjectives" },
  { word: "sparkly", category: "adjectives" },
  { word: "striped", category: "adjectives" },
  { word: "polka-dot", category: "adjectives" },
  { word: "baby", category: "adjectives" },
  { word: "robotic", category: "adjectives" },
  { word: "hairy", category: "adjectives" },
  { word: "inflatable", category: "adjectives" },

  // =========================================================================
  // SETTINGS / PLACES (30 words) — recognizable everyday + fun locations
  // =========================================================================
  { word: "beach", category: "settings" },
  { word: "kitchen", category: "settings" },
  { word: "moon", category: "settings" },
  { word: "grocery store", category: "settings" },
  { word: "park", category: "settings" },
  { word: "mountain", category: "settings" },
  { word: "castle", category: "settings" },
  { word: "farm", category: "settings" },
  { word: "hospital", category: "settings" },
  { word: "school", category: "settings" },
  { word: "library", category: "settings" },
  { word: "museum", category: "settings" },
  { word: "zoo", category: "settings" },
  { word: "circus", category: "settings" },
  { word: "playground", category: "settings" },
  { word: "space", category: "settings" },
  { word: "ocean", category: "settings" },
  { word: "rooftop", category: "settings" },
  { word: "garden", category: "settings" },
  { word: "cave", category: "settings" },
  { word: "island", category: "settings" },
  { word: "city", category: "settings" },
  { word: "forest", category: "settings" },
  { word: "desert", category: "settings" },
  { word: "swamp", category: "settings" },
  { word: "volcano", category: "settings" },
  { word: "airport", category: "settings" },
  { word: "train station", category: "settings" },
  { word: "bowling alley", category: "settings" },
  { word: "aquarium", category: "settings" },

  // =========================================================================
  // PROFESSIONS (20 words) — universally known roles
  // =========================================================================
  { word: "astronaut", category: "professions" },
  { word: "pirate", category: "professions" },
  { word: "cowboy", category: "professions" },
  { word: "ninja", category: "professions" },
  { word: "chef", category: "professions" },
  { word: "firefighter", category: "professions" },
  { word: "doctor", category: "professions" },
  { word: "teacher", category: "professions" },
  { word: "wizard", category: "professions" },
  { word: "clown", category: "professions" },
  { word: "farmer", category: "professions" },
  { word: "mailman", category: "professions" },
  { word: "knight", category: "professions" },
  { word: "robot", category: "professions" },
  { word: "superhero", category: "professions" },
  { word: "detective", category: "professions" },
  { word: "king", category: "professions" },
  { word: "queen", category: "professions" },
  { word: "pilot", category: "professions" },
  { word: "lifeguard", category: "professions" },

  // =========================================================================
  // VEHICLES (20 words) — easy to picture
  // =========================================================================
  { word: "car", category: "vehicles" },
  { word: "bus", category: "vehicles" },
  { word: "train", category: "vehicles" },
  { word: "airplane", category: "vehicles" },
  { word: "helicopter", category: "vehicles" },
  { word: "boat", category: "vehicles" },
  { word: "spaceship", category: "vehicles" },
  { word: "submarine", category: "vehicles" },
  { word: "motorcycle", category: "vehicles" },
  { word: "truck", category: "vehicles" },
  { word: "bicycle", category: "vehicles" },
  { word: "hot air balloon", category: "vehicles" },
  { word: "rocket", category: "vehicles" },
  { word: "canoe", category: "vehicles" },
  { word: "tractor", category: "vehicles" },
  { word: "fire truck", category: "vehicles" },
  { word: "taxi", category: "vehicles" },
  { word: "scooter", category: "vehicles" },
  { word: "sled", category: "vehicles" },
  { word: "roller coaster", category: "vehicles" },

  // =========================================================================
  // NATURE (20 words) — simple natural things
  // =========================================================================
  { word: "tree", category: "nature" },
  { word: "cloud", category: "nature" },
  { word: "rainbow", category: "nature" },
  { word: "sun", category: "nature" },
  { word: "star", category: "nature" },
  { word: "flower", category: "nature" },
  { word: "mushroom", category: "nature" },
  { word: "cactus", category: "nature" },
  { word: "waterfall", category: "nature" },
  { word: "river", category: "nature" },
  { word: "lightning", category: "nature" },
  { word: "snowflake", category: "nature" },
  { word: "tornado", category: "nature" },
  { word: "rain", category: "nature" },
  { word: "sunset", category: "nature" },
  { word: "boulder", category: "nature" },
  { word: "sunflower", category: "nature" },
  { word: "vine", category: "nature" },
  { word: "wave", category: "nature" },
  { word: "volcano", category: "nature" },

  // =========================================================================
  // BODY PARTS (15 words) — fun visual modifiers
  // =========================================================================
  { word: "wings", category: "body parts" },
  { word: "tail", category: "body parts" },
  { word: "horns", category: "body parts" },
  { word: "mustache", category: "body parts" },
  { word: "tentacles", category: "body parts" },
  { word: "claws", category: "body parts" },
  { word: "feathers", category: "body parts" },
  { word: "skeleton", category: "body parts" },
  { word: "eyeball", category: "body parts" },
  { word: "fangs", category: "body parts" },
  { word: "paws", category: "body parts" },
  { word: "beak", category: "body parts" },
  { word: "antlers", category: "body parts" },
  { word: "extra arms", category: "body parts" },
  { word: "spots", category: "body parts" },

  // =========================================================================
  // MATERIALS (15 words) — simple, everyday materials
  // =========================================================================
  { word: "glass", category: "materials" },
  { word: "chocolate", category: "materials" },
  { word: "cheese", category: "materials" },
  { word: "ice", category: "materials" },
  { word: "jelly", category: "materials" },
  { word: "paper", category: "materials" },
  { word: "rubber", category: "materials" },
  { word: "wood", category: "materials" },
  { word: "gold", category: "materials" },
  { word: "diamond", category: "materials" },
  { word: "bubblegum", category: "materials" },
  { word: "slime", category: "materials" },
  { word: "lava", category: "materials" },
  { word: "cotton candy", category: "materials" },
  { word: "cardboard", category: "materials" },

  // =========================================================================
  // COLORS (15 words) — basic colors everyone knows
  // =========================================================================
  { word: "red", category: "colors" },
  { word: "blue", category: "colors" },
  { word: "green", category: "colors" },
  { word: "yellow", category: "colors" },
  { word: "orange", category: "colors" },
  { word: "purple", category: "colors" },
  { word: "pink", category: "colors" },
  { word: "golden", category: "colors" },
  { word: "silver", category: "colors" },
  { word: "white", category: "colors" },
  { word: "black", category: "colors" },
  { word: "rainbow", category: "colors" },
  { word: "neon", category: "colors" },
  { word: "glowing", category: "colors" },
  { word: "striped", category: "colors" },

  // =========================================================================
  // WEATHER (15 words) — simple weather everyone knows
  // =========================================================================
  { word: "thunderstorm", category: "weather" },
  { word: "tornado", category: "weather" },
  { word: "blizzard", category: "weather" },
  { word: "rainbow", category: "weather" },
  { word: "fog", category: "weather" },
  { word: "lightning", category: "weather" },
  { word: "rain", category: "weather" },
  { word: "snow", category: "weather" },
  { word: "sunshine", category: "weather" },
  { word: "hail", category: "weather" },
  { word: "wind", category: "weather" },
  { word: "clouds", category: "weather" },
  { word: "hurricane", category: "weather" },
  { word: "flood", category: "weather" },
  { word: "sunset", category: "weather" },

  // =========================================================================
  // CLOTHING (15 words) — simple wearable items
  // =========================================================================
  { word: "top hat", category: "clothing" },
  { word: "cowboy hat", category: "clothing" },
  { word: "sunglasses", category: "clothing" },
  { word: "cape", category: "clothing" },
  { word: "scarf", category: "clothing" },
  { word: "boots", category: "clothing" },
  { word: "flip flops", category: "clothing" },
  { word: "tutu", category: "clothing" },
  { word: "crown", category: "clothing" },
  { word: "bow tie", category: "clothing" },
  { word: "overalls", category: "clothing" },
  { word: "apron", category: "clothing" },
  { word: "helmet", category: "clothing" },
  { word: "roller skates", category: "clothing" },
  { word: "diaper", category: "clothing" },

  // =========================================================================
  // MUSICAL INSTRUMENTS (15 words) — well-known instruments
  // =========================================================================
  { word: "guitar", category: "musical instruments" },
  { word: "piano", category: "musical instruments" },
  { word: "drums", category: "musical instruments" },
  { word: "trumpet", category: "musical instruments" },
  { word: "banjo", category: "musical instruments" },
  { word: "tuba", category: "musical instruments" },
  { word: "violin", category: "musical instruments" },
  { word: "harmonica", category: "musical instruments" },
  { word: "xylophone", category: "musical instruments" },
  { word: "accordion", category: "musical instruments" },
  { word: "tambourine", category: "musical instruments" },
  { word: "ukulele", category: "musical instruments" },
  { word: "cowbell", category: "musical instruments" },
  { word: "maracas", category: "musical instruments" },
  { word: "saxophone", category: "musical instruments" },
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
