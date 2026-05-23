import {
  Controller,
  Post,
  Body,
  UseInterceptors,
  UploadedFile,
  Get,
  Param,
  Delete,
  Patch,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AssignmentsService } from './assignments.service';
import { CreateAssignmentDto, UpdateAssignmentDto } from './dto/create-assignment.dto';

@Controller('assignments')
export class AssignmentsController {
  constructor(private readonly assignmentsService: AssignmentsService) {}

@Post('school/:schoolId/teacher/:teacherId/upload')
@UseInterceptors(FileInterceptor('file'))
async uploadAssignment(
  @Param('schoolId') schoolId: string,
  @Param('teacherId') teacherId: string,
  @Body('payload') payload: string,
  @UploadedFile(
    new ParseFilePipe({
      validators: [
        new MaxFileSizeValidator({ 
          maxSize: 1024 * 1024 * 2,
          message: 'File is too large. Maximum size is 2MB'
        }),
        // new FileTypeValidator({ 
        //   fileType: '.(pdf|doc|docx|xls|xlsx|ppt|pptx)',
        // }),
      ],
      fileIsRequired: false,
    }),
  )
  file?: Express.Multer.File,
) {

  const dto = JSON.parse(payload) as CreateAssignmentDto;

  // Ensure route params override whatever is in the payload
  dto.schoolId = schoolId;
  dto.teacherId = teacherId;

  return this.assignmentsService.createAssignment(dto, file);
}

  @Get('school/:schoolId/teacher/:teacherId')
  async getTeacherAssignments(
    @Param('schoolId') schoolId: string,
    @Param('teacherId') teacherId: string,
  ) {
    return this.assignmentsService.getTeacherAssignments(schoolId, teacherId);
  }

  @Get(':id')
  async getAssignment(@Param('id') id: string) {
    return this.assignmentsService.getAssignmentById(id);
  }

  @Patch(':id')
  @UseInterceptors(FileInterceptor('file'))
  async updateAssignment(
    @Param('id') id: string,
    @Body('payload') payload: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ 
            maxSize: 1024 * 1024 * 2,
            message: 'File is too large. Maximum size is 2MB'
          }),
          new FileTypeValidator({ 
            fileType: '.(pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar|7z)',
          }),
        ],
        fileIsRequired: false,
      }),
    )
    file?: Express.Multer.File,
  ) {
    const dto = JSON.parse(payload) as UpdateAssignmentDto;
    return this.assignmentsService.updateAssignment(id, dto, file);
  }

  @Delete(':id')
  async deleteAssignment(@Param('id') id: string) {
    return this.assignmentsService.deleteAssignment(id);
  }
}