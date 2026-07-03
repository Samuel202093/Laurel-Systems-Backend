import {
  Controller,
  Post,
  Get,
  Body,
  Res,
  Req,
  HttpStatus,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { StudentLoginDto } from './dto/student-login.dto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ─── LOGIN ──────────────────────────────────────────────────────────────────

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Login for all user roles (Super Admin, School Admin, Teacher, Student)',
  })
  @ApiResponse({ status: 200, description: 'User successfully logged in' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(@Body() loginDto: LoginDto, @Res() res: Response) {
    const result = await this.authService.login(loginDto);
    return res.status(HttpStatus.OK).json({
      statusCode: HttpStatus.OK,
      message: 'Login successful',
      data: result,
    });
  }

  @Post('student/login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login for students using registration number' })
  @ApiResponse({ status: 200, description: 'Student successfully logged in' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async studentLogin(
    @Body() studentLoginDto: StudentLoginDto,
    @Res() res: Response,
  ) {
    const result = await this.authService.studentLogin(studentLoginDto);
    return res.status(HttpStatus.OK).json({
      statusCode: HttpStatus.OK,
      message: 'Student login successful',
      data: result,
    });
  }

  // ─── LOGOUT ─────────────────────────────────────────────────────────────────

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout the current user' })
  @ApiResponse({ status: 200, description: 'User successfully logged out' })
  async logout(@Req() req: any, @Res() res: Response) {
    const userId = req.user.sub;
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1] ?? '';

    await this.authService.logout(userId, token);

    return res.status(HttpStatus.OK).json({
      statusCode: HttpStatus.OK,
      message: 'Logout successful',
    });
  }

  // ─── CURRENT USER PROFILE ───────────────────────────────────────────────────

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get current user profile',
    description:
      'Returns the full profile of the currently authenticated user based on their role.',
  })
  @ApiResponse({ status: 200, description: 'Profile retrieved successfully' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — token missing or invalid',
  })
  async getProfile(@Req() req: Request, @Res() res: Response) {
    const jwtUser = (req as any).user as { sub: string; role: string };
    const profile = await this.authService.getProfile(
      jwtUser.sub,
      jwtUser.role,
    );

    return res.status(HttpStatus.OK).json({
      statusCode: HttpStatus.OK,
      message: 'Profile retrieved successfully',
      data: profile,
    });
  }

  // ─── OTP ────────────────────────────────────────────────────────────────────

  @Post('otp/send')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Send OTP',
    description: 'Sends a one-time password to the given email.',
  })
  @ApiResponse({ status: 200, description: 'OTP sent successfully' })
  async sendOtp(@Body('email') email: string, @Res() res: Response) {
    const result = await this.authService.sendOtp(email);
    return res.status(HttpStatus.OK).json({
      statusCode: HttpStatus.OK,
      message: 'OTP sent successfully',
      data: result,
    });
  }

  @Post('otp/resend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Resend OTP',
    description: 'Resends the one-time password to the given email.',
  })
  @ApiResponse({ status: 200, description: 'OTP resent successfully' })
  async resendOtp(@Body('email') email: string, @Res() res: Response) {
    const result = await this.authService.resendOtp(email);
    return res.status(HttpStatus.OK).json({
      statusCode: HttpStatus.OK,
      message: 'OTP resent successfully',
      data: result,
    });
  }

  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify OTP',
    description: 'Verifies the OTP code sent to the given email.',
  })
  @ApiResponse({ status: 200, description: 'OTP verified successfully' })
  @ApiResponse({ status: 400, description: 'Invalid or expired OTP' })
  async verifyOtp(
    @Body('email') email: string,
    @Body('code') code: string,
    @Res() res: Response,
  ) {
    await this.authService.verifyOtp(email, code);
    return res.status(HttpStatus.OK).json({
      statusCode: HttpStatus.OK,
      message: 'OTP verified successfully',
    });
  }
}
