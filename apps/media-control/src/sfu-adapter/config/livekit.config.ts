import { registerAs } from "@nestjs/config";

export default registerAs("livekit", () => ({
  apiKey: process.env.LIVEKIT_API_KEY,
  apiSecret: process.env.LIVEKIT_API_SECRET,
  serverUrl: process.env.LIVEKIT_SERVER_URL,
}));
