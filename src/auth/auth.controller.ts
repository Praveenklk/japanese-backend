import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // REGISTER
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.authService.register(
      dto.email,
      dto.password,
    );

    const token = this.authService.login(user);

    // ✅ PRODUCTION COOKIE CONFIG
    res.cookie('access_token', token, {
      httpOnly: true,
      secure: true,        // REQUIRED (HTTPS)
      sameSite: 'none',    // REQUIRED (cross-site)
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return {
      message: 'Registration successful',
      email: user.email,
    };
  }

  // LOGIN
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.authService.validateUser(
      dto.email,
      dto.password,
    );

    const token = this.authService.login(user);

    // ✅ PRODUCTION COOKIE CONFIG
    res.cookie('access_token', token, {
      httpOnly: true,
      secure: true,        // REQUIRED (HTTPS)
      sameSite: 'none',    // REQUIRED (cross-site)
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return { message: 'Login successful' };
  }

  // ME
  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMe(@Req() req: any) {
    return req.user;
  }

  // LOGOUT
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('access_token', {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
    });
    return { message: 'Logged out' };
  }
}
