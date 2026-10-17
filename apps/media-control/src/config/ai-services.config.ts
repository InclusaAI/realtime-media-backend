import { registerAs } from "@nestjs/config";

/**
 * HTTP endpoints for the ai-services surface (deployed on Render).
 *
 * The media plane is Kafka-decoupled by design: audio and video travel over the
 * `media.session.*` topics and ai-services consumes those directly, so neither
 * of these URLs sits on the media hot path. They are recorded here for
 * diagnostics (surfaced in the health payload) and for the direct-call
 * fallback paths that talk to a single service over HTTP.
 *
 * Both default to empty string, meaning "not configured" — local dev does not
 * need them.
 */
export default registerAs("aiServices", () => ({
  signRecognitionUrl:
    process.env.SIGN_RECOGNITION_SERVICE_URL?.trim() || "",
  avatarPoseUrl: process.env.AVATAR_POSE_SERVICE_URL?.trim() || "",
}));