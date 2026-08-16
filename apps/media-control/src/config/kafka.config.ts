import { registerAs } from "@nestjs/config";

export default registerAs("kafka", () => {
  const brokers = process.env.KAFKA_BROKERS || "localhost:9092";
  return {
    brokers: brokers.split(",").map((broker) => broker.trim()),
  };
});
