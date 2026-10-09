// supabase/functions/calculate-free-kundli/cities.ts

export interface CityLocation {
  id: string;
  name: string;
  state: string;
  country: string;
  latitude: number;
  longitude: number;
  timezone: string;
  aliases?: string[];
}

export const INDIAN_CITIES: CityLocation[] = [
  // Sacred & Pilgrimage Centers
  { id: "varanasi", name: "Varanasi", aliases: ["kashi", "banaras", "benares"], state: "Uttar Pradesh", country: "India", latitude: 25.3176, longitude: 82.9739, timezone: "Asia/Kolkata" },
  { id: "prayagraj", name: "Prayagraj", aliases: ["allahabad", "prayag"], state: "Uttar Pradesh", country: "India", latitude: 25.4358, longitude: 81.8463, timezone: "Asia/Kolkata" },
  { id: "ayodhya", name: "Ayodhya", aliases: ["faizabad", "saket"], state: "Uttar Pradesh", country: "India", latitude: 26.7922, longitude: 82.1998, timezone: "Asia/Kolkata" },
  { id: "mathura", name: "Mathura", aliases: ["vrindavan", "braj"], state: "Uttar Pradesh", country: "India", latitude: 27.4924, longitude: 77.6737, timezone: "Asia/Kolkata" },
  { id: "haridwar", name: "Haridwar", aliases: ["hardwar", "gangadwar"], state: "Uttarakhand", country: "India", latitude: 29.9457, longitude: 78.1642, timezone: "Asia/Kolkata" },
  { id: "rishikesh", name: "Rishikesh", aliases: ["hrishikesh"], state: "Uttarakhand", country: "India", latitude: 30.0869, longitude: 78.2676, timezone: "Asia/Kolkata" },
  { id: "ujjain", name: "Ujjain", aliases: ["avantika", "ujjaini"], state: "Madhya Pradesh", country: "India", latitude: 23.1765, longitude: 75.7885, timezone: "Asia/Kolkata" },
  { id: "nashik", name: "Nashik", aliases: ["nasik", "panchavati"], state: "Maharashtra", country: "India", latitude: 19.9975, longitude: 73.7898, timezone: "Asia/Kolkata" },
  { id: "puri", name: "Puri", aliases: ["jagannath puri"], state: "Odisha", country: "India", latitude: 19.8135, longitude: 85.8312, timezone: "Asia/Kolkata" },
  { id: "dwarka", name: "Dwarka", aliases: ["dvaraka"], state: "Gujarat", country: "India", latitude: 22.2442, longitude: 68.9685, timezone: "Asia/Kolkata" },
  { id: "tirupati", name: "Tirupati", aliases: ["tirumala"], state: "Andhra Pradesh", country: "India", latitude: 13.6288, longitude: 79.4192, timezone: "Asia/Kolkata" },
  { id: "madurai", name: "Madurai", aliases: ["meenakshi"], state: "Tamil Nadu", country: "India", latitude: 9.9252, longitude: 78.1198, timezone: "Asia/Kolkata" },
  { id: "gaya", name: "Gaya", aliases: ["bodhgaya", "bodh gaya"], state: "Bihar", country: "India", latitude: 24.7914, longitude: 85.0002, timezone: "Asia/Kolkata" },

  // Metropolitan & State Capitals
  { id: "delhi", name: "New Delhi", aliases: ["delhi", "ncr", "dilli"], state: "Delhi", country: "India", latitude: 28.6139, longitude: 77.2090, timezone: "Asia/Kolkata" },
  { id: "mumbai", name: "Mumbai", aliases: ["bombay"], state: "Maharashtra", country: "India", latitude: 18.9220, longitude: 72.8347, timezone: "Asia/Kolkata" },
  { id: "kolkata", name: "Kolkata", aliases: ["calcutta"], state: "West Bengal", country: "India", latitude: 22.5726, longitude: 88.3639, timezone: "Asia/Kolkata" },
  { id: "chennai", name: "Chennai", aliases: ["madras"], state: "Tamil Nadu", country: "India", latitude: 13.0827, longitude: 80.2707, timezone: "Asia/Kolkata" },
  { id: "bengaluru", name: "Bengaluru", aliases: ["bangalore"], state: "Karnataka", country: "India", latitude: 12.9716, longitude: 77.5946, timezone: "Asia/Kolkata" },
  { id: "hyderabad", name: "Hyderabad", aliases: ["secunderabad"], state: "Telangana", country: "India", latitude: 17.3850, longitude: 78.4867, timezone: "Asia/Kolkata" },
  { id: "ahmedabad", name: "Ahmedabad", aliases: ["amdavad", "karnavati"], state: "Gujarat", country: "India", latitude: 23.0225, longitude: 72.5714, timezone: "Asia/Kolkata" },
  { id: "pune", name: "Pune", aliases: ["poona"], state: "Maharashtra", country: "India", latitude: 18.5204, longitude: 73.8567, timezone: "Asia/Kolkata" },
  { id: "jaipur", name: "Jaipur", aliases: ["pink city"], state: "Rajasthan", country: "India", latitude: 26.9124, longitude: 75.7873, timezone: "Asia/Kolkata" },
  { id: "lucknow", name: "Lucknow", aliases: ["awadh"], state: "Uttar Pradesh", country: "India", latitude: 26.8467, longitude: 80.9462, timezone: "Asia/Kolkata" },
  { id: "patna", name: "Patna", aliases: ["patliputra", "pataliputra"], state: "Bihar", country: "India", latitude: 25.5941, longitude: 85.1376, timezone: "Asia/Kolkata" },
  { id: "bhopal", name: "Bhopal", aliases: [], state: "Madhya Pradesh", country: "India", latitude: 23.2599, longitude: 77.4126, timezone: "Asia/Kolkata" },
  { id: "indore", name: "Indore", aliases: [], state: "Madhya Pradesh", country: "India", latitude: 22.7196, longitude: 75.8577, timezone: "Asia/Kolkata" },
  { id: "chandigarh", name: "Chandigarh", aliases: [], state: "Chandigarh", country: "India", latitude: 30.7333, longitude: 76.7794, timezone: "Asia/Kolkata" },
  { id: "dehradun", name: "Dehradun", aliases: ["doon"], state: "Uttarakhand", country: "India", latitude: 30.3165, longitude: 78.0322, timezone: "Asia/Kolkata" },
  { id: "shimla", name: "Shimla", aliases: ["simla"], state: "Himachal Pradesh", country: "India", latitude: 31.1048, longitude: 77.1734, timezone: "Asia/Kolkata" },
  { id: "srinagar", name: "Srinagar", aliases: [], state: "Jammu and Kashmir", country: "India", latitude: 34.0837, longitude: 74.7973, timezone: "Asia/Kolkata" },
  { id: "ranchi", name: "Ranchi", aliases: [], state: "Jharkhand", country: "India", latitude: 23.3441, longitude: 85.3096, timezone: "Asia/Kolkata" },
  { id: "raipur", name: "Raipur", aliases: [], state: "Chhattisgarh", country: "India", latitude: 21.2514, longitude: 81.6296, timezone: "Asia/Kolkata" },
  { id: "bhubaneswar", name: "Bhubaneswar", aliases: ["bhubneshwar"], state: "Odisha", country: "India", latitude: 20.2961, longitude: 85.8245, timezone: "Asia/Kolkata" },
  { id: "guwahati", name: "Guwahati", aliases: ["gauhati"], state: "Assam", country: "India", latitude: 26.1445, longitude: 91.7362, timezone: "Asia/Kolkata" },

  // Key International NRI Hubs
  { id: "new_york", name: "New York", aliases: ["nyc", "new york city"], state: "New York", country: "United States", latitude: 40.7128, longitude: -74.0060, timezone: "America/New_York" },
  { id: "san_francisco", name: "San Francisco", aliases: ["bay area"], state: "California", country: "United States", latitude: 37.7749, longitude: -122.4194, timezone: "America/Los_Angeles" },
  { id: "london", name: "London", aliases: ["uk"], state: "Greater London", country: "United Kingdom", latitude: 51.5074, longitude: -0.1278, timezone: "Europe/London" },
  { id: "dubai", name: "Dubai", aliases: ["uae"], state: "Dubai", country: "United Arab Emirates", latitude: 25.2048, longitude: 55.2708, timezone: "Asia/Dubai" },
  { id: "singapore", name: "Singapore", aliases: [], state: "Central", country: "Singapore", latitude: 1.3521, longitude: 103.8198, timezone: "Asia/Singapore" },
  { id: "toronto", name: "Toronto", aliases: [], state: "Ontario", country: "Canada", latitude: 43.6532, longitude: -79.3832, timezone: "America/Toronto" },
  { id: "sydney", name: "Sydney", aliases: [], state: "New South Wales", country: "Australia", latitude: -33.8688, longitude: 151.2093, timezone: "Australia/Sydney" },
];

export function normalizePlaceQuery(input: string): string {
  return input
    .toLowerCase()
    .replace(/[,\.\-\/\\_\(\)]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function resolveCityLocation(placeInput: string): CityLocation | null {
  const normalized = normalizePlaceQuery(placeInput);
  if (!normalized) return null;

  // 1. Exact match on city name or alias
  const exact = INDIAN_CITIES.find(
    (c) =>
      normalizePlaceQuery(c.name) === normalized ||
      (c.aliases || []).some((a) => normalizePlaceQuery(a) === normalized)
  );
  if (exact) return exact;

  // 2. Starts with query
  const startsWith = INDIAN_CITIES.find(
    (c) =>
      normalizePlaceQuery(c.name).startsWith(normalized) ||
      (c.aliases || []).some((a) => normalizePlaceQuery(a).startsWith(normalized))
  );
  if (startsWith) return startsWith;

  // 3. Substring match
  const sub = INDIAN_CITIES.find(
    (c) =>
      normalizePlaceQuery(c.name).includes(normalized) ||
      (c.aliases || []).some((a) => normalizePlaceQuery(a).includes(normalized))
  );
  return sub || null;
}
