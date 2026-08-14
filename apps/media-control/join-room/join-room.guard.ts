import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Observable } from "rxjs";
import * as jwt from "jsonwebtoken";

@Injectable()
export class JoinRoomGuard implements CanActivate {
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const client = context.switchToWs().getClient();
    const data = context.switchToWs().getData();

    try {
      const decoded = jwt.verify(data.token, "your-secret-key"); // Replace with your actual secret key
      client.user = decoded;
      return true;
    } catch (err) {
      client.emit("error", "Invalid token");
      return false;
    }
  }
}
