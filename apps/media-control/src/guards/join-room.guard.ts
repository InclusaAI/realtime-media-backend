import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Observable } from "rxjs";
import * as jwt from "jsonwebtoken";

@Injectable()
export class JoinRoomGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const client = context.switchToWs().getClient();
    const data = context.switchToWs().getData();

    try {
      const jwtSecret = this.configService.get<string>("JWT_SECRET");
      if (!jwtSecret) {
        throw new Error("JWT_SECRET not configured");
      }
      const decoded = jwt.verify(data.token, jwtSecret);
      client.user = decoded;
      return true;
    } catch (err) {
      client.emit("error", `Authentication failed: ${(err as Error).message}`);
      return false;
    }
  }
}
