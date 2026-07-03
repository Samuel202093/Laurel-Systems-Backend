import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { MailService } from '../mail/mail.service';
import {
  CreateAssignmentDto,
  UpdateAssignmentDto,
} from './dto/create-assignment.dto';

@Injectable()
export class AssignmentsService {
  private readonly logger = new Logger(AssignmentsService.name);

  constructor(
    private prisma: PrismaService,
    private cloudinaryService: CloudinaryService,
    private mailService: MailService,
  ) {}

  async createAssignment(dto: CreateAssignmentDto, file?: Express.Multer.File) {
    this.logger.log(`createAssignment called with dto: ${JSON.stringify(dto)}`);
    this.logger.log(`File received: ${file ? file.originalname : 'no file'}`);
    try {
      let { subjectId, classId, schoolId, subjectName, className } = dto;

      // Resolve subjectId if not provided
      if (!subjectId && subjectName) {
        this.logger.log(
          `Attempting to resolve subjectId for name: ${subjectName} in school: ${schoolId}`,
        );
        const subject = await (this.prisma as any).subject.findFirst({
          where: { schoolId, name: subjectName },
        });
        subjectId = subject?.id;
        this.logger.log(`Resolved subjectId: ${subjectId || 'NOT FOUND'}`);
      }

      // Resolve classId if not provided
      if (!classId && className) {
        this.logger.log(
          `Attempting to resolve classId for name: ${className} in school: ${schoolId}`,
        );
        const classData = await (this.prisma as any).class.findFirst({
          where: { schoolId, name: className },
        });
        classId = classData?.id;
        this.logger.log(`Resolved classId: ${classId || 'NOT FOUND'}`);
      }

      let fileUrl: string | null = null;
      let fileKey: string | null = null;

      if (file) {
        this.logger.log(
          `Step 2: Uploading file - ${file.originalname}, mimetype: ${file.mimetype}, size: ${file.size}`,
        );
        const folder = `schools/${dto.schoolId}/assignments/${subjectId || subjectName}`;
        const uploadResult = await this.cloudinaryService.uploadFile(
          file,
          folder,
        );
        fileUrl = uploadResult.secure_url;
        fileKey = uploadResult.public_id;
        this.logger.log(
          `Step 3: File uploaded - ${fileUrl}, public_id: ${fileKey}`,
        );
      }

      this.logger.log('Step 4: Creating assignment in DB...');
      const {
        schoolId: _schoolId,
        teacherId: _teacherId,
        subjectId: _subjectId,
        classId: _classId,
        dueDate: _dueDate,
        ...restDto
      } = dto;

      const assignment = await (this.prisma as any).assignment.create({
        data: {
          ...restDto,
          dueDate: new Date(dto.dueDate),
          fileUrl,
          fileKey,
          school: { connect: { id: dto.schoolId } },
          teacher: { connect: { id: dto.teacherId } },
          ...(subjectId ? { subject: { connect: { id: subjectId } } } : {}),
          ...(classId ? { class: { connect: { id: classId } } } : {}),
        },
      });

      this.logger.log('Step 5: Assignment created successfully');
      this.notifyStudentsOfAssignment(assignment).catch((err) => {
        this.logger.error(
          `Failed to send assignment notifications: ${err.message}`,
          err.stack,
        );
      });

      return assignment;
    } catch (error) {
      this.logger.error(
        `Failed to create assignment: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException('Could not create assignment');
    }
  }

  private async notifyStudentsOfAssignment(assignment: any) {
    const teacher = await (this.prisma as any).teacher.findUnique({
      where: { id: assignment.teacherId },
      select: { fullName: true },
    });

    const school = await (this.prisma as any).school.findUnique({
      where: { id: assignment.schoolId },
      select: { name: true },
    });

    // If subjectId/classId are missing, we use names directly from assignment
    // If they are present, we could still use names from assignment as they should match
    const subjectName = assignment.subjectName;
    const className = assignment.className;

    const students = await (this.prisma as any).student.findMany({
      where: {
        classId: assignment.classId, // We still need classId for querying students
        schoolId: assignment.schoolId,
        isActive: true,
        email: { not: null },
      },
      select: {
        email: true,
        firstName: true,
        lastName: true,
      },
    });

    if (!students || students.length === 0) {
      this.logger.warn(
        `No students with emails found in class ${className} for assignment notification`,
      );
      return;
    }

    this.logger.log(
      `Dispatching assignment notification emails to ${students.length} student(s) in ${className}`,
    );

    await this.mailService.sendAssignmentNotificationEmail(
      {
        title: assignment.title,
        description: assignment.description,
        dueDate: assignment.dueDate,
        term: assignment.term,
        assignmentType: assignment.assignmentType,
        academicSession: assignment.academicSession,
        totalMarks: assignment.totalMarks,
        fileUrl: assignment.fileUrl,
        subjectName: subjectName,
        className: className,
        teacherName: teacher?.fullName || 'Your Teacher',
      },
      students,
      school?.name,
    );
  }

  async updateAssignment(
    id: string,
    dto: UpdateAssignmentDto,
    file?: Express.Multer.File,
  ) {
    const assignment = await (this.prisma as any).assignment.findUnique({
      where: { id },
    });

    if (!assignment) {
      throw new NotFoundException(`Assignment with ID ${id} not found`);
    }

    try {
      let { fileUrl, fileKey, subjectId, classId } = assignment;
      const { subjectName, className, schoolId } = dto;

      // Resolve subjectId if subjectName is provided in update
      if (subjectName && schoolId) {
        const subject = await (this.prisma as any).subject.findFirst({
          where: { schoolId, name: subjectName },
        });
        if (subject) subjectId = subject.id;
      }

      // Resolve classId if className is provided in update
      if (className && schoolId) {
        const classData = await (this.prisma as any).class.findFirst({
          where: { schoolId, name: className },
        });
        if (classData) classId = classData.id;
      }

      if (file) {
        if (fileKey) {
          await this.cloudinaryService.deleteFile(fileKey);
        }

        const folder = `schools/${assignment.schoolId}/assignments/${subjectId || assignment.subjectName}`;
        const uploadResult = await this.cloudinaryService.uploadFile(
          file,
          folder,
        );
        fileUrl = uploadResult.secure_url;
        fileKey = uploadResult.public_id;
      }

      const {
        schoolId: _schoolId,
        subjectId: _subjectId,
        classId: _classId,
        dueDate: _dueDate,
        subjectName: _subjectName,
        className: _className,
        ...restDto
      } = dto;

      return await (this.prisma as any).assignment.update({
        where: { id },
        data: {
          ...restDto,
          subjectName: dto.subjectName,
          className: dto.className,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : assignment.dueDate,
          fileUrl,
          fileKey,
          ...(subjectId ? { subject: { connect: { id: subjectId } } } : {}),
          ...(classId ? { class: { connect: { id: classId } } } : {}),
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to update assignment: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException('Could not update assignment');
    }
  }

  async deleteAssignment(id: string) {
    const assignment = await (this.prisma as any).assignment.findUnique({
      where: { id },
    });

    if (!assignment) {
      throw new NotFoundException(`Assignment with ID ${id} not found`);
    }

    try {
      if (assignment.fileKey) {
        await this.cloudinaryService.deleteFile(assignment.fileKey);
      }

      return await (this.prisma as any).assignment.delete({
        where: { id },
      });
    } catch (error) {
      this.logger.error(
        `Failed to delete assignment: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException('Could not delete assignment');
    }
  }

  async getTeacherAssignments(schoolId: string, teacherId: string) {
    return await (this.prisma as any).assignment.findMany({
      where: { schoolId, teacherId },
      include: {
        subject: true,
        class: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getAssignmentById(id: string) {
    const assignment = await (this.prisma as any).assignment.findUnique({
      where: { id },
      include: {
        subject: true,
        class: true,
        teacher: {
          select: {
            fullName: true,
            email: true,
          },
        },
      },
    });

    if (!assignment) {
      throw new NotFoundException(`Assignment with ID ${id} not found`);
    }

    return assignment;
  }
}
