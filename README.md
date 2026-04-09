# School Management System Backend

A robust and scalable backend system for school management, built with **NestJS**, **Prisma**, and **PostgreSQL**. This system handles school registration, student and teacher management, academic session/term tracking, and a flexible versioned grading system.

## 🚀 Features

- **School Onboarding**: Complete flow for registering schools and their initial structures.
- **Authentication & Authorization**: Secure JWT-based authentication with role-based access control (RBAC).
- **User Management**:
  - **School Admins**: Full control over school settings.
  - **Teachers**: Manage assigned classes, students, and grading.
  - **Students**: Track academic progress and results.
- **Academic Management**:
  - **Sessions & Terms**: Track data across different academic years.
  - **Classes & Arms**: Flexible class structures with arm assignments.
  - **Subjects**: Manage subjects offered per school.
- **Grading System**:
  - **Versioning**: Grading rules are locked to specific sessions/terms to preserve historical data.
  - **Flexible Weights**: Customizable assessment types (CAs, Exams) and pass marks.
  - **Promotion Criteria**: Automated promotion rules based on averages and mandatory subjects.
- **Mail Service**: Automated welcome emails and notifications.
- **Idempotency**: Middleware to prevent duplicate processing of sensitive requests.

## 🛠️ Tech Stack

- **Framework**: [NestJS](https://nestjs.com/)
- **ORM**: [Prisma](https://www.prisma.io/)
- **Database**: PostgreSQL (hosted on Supabase)
- **Authentication**: JWT (JSON Web Tokens) & Passport
- **Documentation**: Swagger/OpenAPI
- **Language**: TypeScript

## 🏁 Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- A PostgreSQL database instance

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd school-management-backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables:
   Create a `.env` file in the root directory and add your credentials:
   ```env
   DATABASE_URL="postgresql://user:password@host:port/dbname?pgbouncer=true&statement_cache_size=0"
   DIRECT_URL="postgresql://user:password@host:port/dbname"
   JWT_SECRET="your-secret-key"
   EMAIL_HOST="smtp.gmail.com"
   EMAIL_USER="your-email@gmail.com"
   MAILER_PASSWORD="your-app-password"
   ```

4. Synchronize the database:
   ```bash
   npx prisma db push
   npx prisma generate
   ```

5. Start the application:
   ```bash
   # Development mode
   npm run start:dev

   # Production mode
   npm run start:prod
   ```

## 📖 API Documentation

Once the application is running, you can access the interactive Swagger documentation at:
`http://localhost:3005/api` (or your configured port).

## 🔐 Authentication Flow

This application uses **JWT (JSON Web Tokens)** for secure authentication.

1. **Login**: The user provides credentials (email/staffId and password).
2. **Token Generation**: Upon successful authentication, the server generates a signed JWT containing the user's ID, role, and school information.
3. **Storage**: The client stores this token (usually in LocalStorage or an HttpOnly cookie).
4. **Authorized Requests**: For every subsequent request to protected endpoints, the client must include the token in the Authorization header:
   `Authorization: Bearer <your-token>`
5. **Validation**: The `JwtAuthGuard` on the server extracts and verifies the token. If valid, the user's data is attached to the request object (`req.user`).
6. **Authorization**: The `RolesGuard` checks if the user's role has permission to access the specific resource.

## 📄 License

This project is [UNLICENSED](LICENSE).
