import type { FastifyReply, FastifyRequest } from "fastify";
import jwt from "jsonwebtoken";

const ACCESS_TOKEN_TTL_SECONDS = 900;
const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 14;
const JWT_SECRET = process.env.JWT_SECRET ?? "replace-this-secret-in-production";

type TokenPayload = {
  sub: string;
  email: string;
  type: "access" | "refresh";
};

export const createTokens = (payload: { userId: string; email: string }) => {
  const accessToken = jwt.sign(
    { sub: payload.userId, email: payload.email, type: "access" } satisfies TokenPayload,
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_TTL_SECONDS }
  );
  const refreshToken = jwt.sign(
    { sub: payload.userId, email: payload.email, type: "refresh" } satisfies TokenPayload,
    JWT_SECRET,
    { expiresIn: REFRESH_TOKEN_TTL_SECONDS }
  );

  return {
    accessToken,
    refreshToken,
    expiresInSeconds: ACCESS_TOKEN_TTL_SECONDS
  };
};

export const verifyAccessToken = (token: string): TokenPayload =>
  jwt.verify(token, JWT_SECRET) as TokenPayload;

export const authGuard = async (request: FastifyRequest, reply: FastifyReply) => {
  const header = request.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return reply.status(401).send({ code: "AUTH_REQUIRED", message: "Missing bearer token" });
  }

  const token = header.replace("Bearer ", "").trim();
  try {
    const payload = verifyAccessToken(token);
    if (payload.type !== "access") {
      throw new Error("Invalid token type");
    }
    (request as FastifyRequest & { auth: { userId: string; email: string } }).auth = {
      userId: payload.sub,
      email: payload.email
    };
  } catch {
    return reply.status(401).send({ code: "INVALID_TOKEN", message: "Invalid or expired token" });
  }
};
