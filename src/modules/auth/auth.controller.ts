import { Controller, Post, Body, Res, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  @ApiOperation({ summary: 'Login for all user roles (Super Admin, School Admin, Teacher, Student)' })
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

  @Post('otp/send')
  async sendOtp(@Body('email') email: string, @Res() res: Response) {
    const result = await this.authService.sendOtp(email);
    return res.status(HttpStatus.OK).json({
      statusCode: HttpStatus.OK,
      message: 'OTP sent successfully',
      data: result,
    });
  }

  @Post('otp/resend')
  async resendOtp(@Body('email') email: string, @Res() res: Response) {
    const result = await this.authService.resendOtp(email);
    return res.status(HttpStatus.OK).json({
      statusCode: HttpStatus.OK,
      message: 'OTP resent successfully',
      data: result,
    });
  }

  @Post('otp/verify')
  async verifyOtp(@Body('email') email: string, @Body('code') code: string, @Res() res: Response) {
    await this.authService.verifyOtp(email, code);
    return res.status(HttpStatus.OK).json({
      statusCode: HttpStatus.OK,
      message: 'OTP verified successfully',
    });
  }
}
