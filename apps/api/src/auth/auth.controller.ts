import { Body, Controller, Inject, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "@aethina/shared-types";
import { AuthGuard } from "../common/auth.guard.js";
import { CurrentUserParam } from "../common/current-user.decorator.js";
import { AuthService } from "./auth.service.js";

@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Post("login")
  login(@Body() body: unknown) {
    return this.authService.login(body);
  }

  @Post("portal-login")
  portalLogin(@Body() body: unknown) {
    return this.authService.portalLogin(body);
  }

  @Post("logout")
  @UseGuards(AuthGuard)
  logout(@CurrentUserParam() user: CurrentUser, @Body() body: { deviceId?: string | null }) {
    return this.authService.logout(user, body.deviceId);
  }

  @Post("change-password")
  @UseGuards(AuthGuard)
  changePassword(@CurrentUserParam() user: CurrentUser, @Body() body: unknown) {
    return this.authService.changePassword(user, body);
  }
}
