# Airport Carpooling Backend API

Backend REST API for an airport carpooling application built with Node.js, Express, and MongoDB.

## 🚀 Features

### V1 Implementation

- ✅ User authentication (JWT with access & refresh tokens)
- ✅ User profile management (driver/passenger/both roles)
- ✅ Airport management (pre-seeded French airports)
- ✅ Ride creation, search, and management
- ✅ Booking system (request/accept/reject/cancel)
- ✅ Notifications system
- ✅ Input validation and error handling

## 📋 Prerequisites

- Node.js v16+
- MongoDB v5+ (or a MongoDB Atlas account)
- npm or yarn

## 🛠️ Installation

### 1. Clone and Install Dependencies

```bash
npm install
```

### 2. Database Setup

Create a PostgreSQL database:

```bash
createdb airport_carpooling
```

Or via SQL:

```sql
CREATE DATABASE airport_carpooling;
```

### 3. Configure Environment Variables

Update the `.env` file with your database credentials:

```env
# Server Configuration
NODE_ENV=development
PORT=3000

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_password_here
DB_NAME=airport_carpooling

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_REFRESH_SECRET=your-super-secret-refresh-key-change-in-production
```

⚠️ **Important**: Change the JWT secrets in production!

### 4. Run Migrations and Seed Data

```bash
# Run database migrations
npm run migrate

# Seed airports data
npm run seed

# Or run both at once
npm run setup
```

### 5. Start the Server

```bash
# Development mode (with auto-reload)
npm run dev

# Production mode
npm start
```

The API will be available at `http://localhost:3000`

## 📚 API Documentation

### Base URL

```
http://localhost:3000/api/v1
```

### Authentication Endpoints

#### Register

```http
POST /auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword",
  "first_name": "John",
  "last_name": "Doe",
  "phone": "+33612345678",
  "role": "both"
}
```

#### Login

```http
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword"
}
```

Response:

```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": { ... },
    "accessToken": "...",
    "refreshToken": "..."
  }
}
```

#### Refresh Token

```http
POST /auth/refresh
Content-Type: application/json

{
  "refresh_token": "your_refresh_token"
}
```

#### Logout

```http
POST /auth/logout
Authorization: Bearer <access_token>
```

#### Delete Account

```http
DELETE /auth/me
Authorization: Bearer <access_token>
```

### User Endpoints

#### Get Profile

```http
GET /users/me
Authorization: Bearer <access_token>
```

#### Update Profile

```http
PATCH /users/me
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "first_name": "Jane",
  "role": "driver",
  "phone": "+33687654321"
}
```

### Airport Endpoints

#### Get All Airports

```http
GET /airports
GET /airports?country=France
```

#### Get Airport by ID

```http
GET /airports/:id
```

### Ride Endpoints

#### Create Ride (Driver)

```http
POST /rides
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "airport_id": "uuid",
  "direction": "home_to_airport",
  "home_address": "123 Rue de Paris",
  "home_postcode": "75001",
  "home_city": "Paris",
  "datetime_start": "2025-12-31T10:00:00Z",
  "seats_total": 3,
  "price_per_seat": 15.00,
  "comment": "Bagages acceptés"
}
```

#### Search Rides

```http
GET /rides?airport_id=uuid&direction=home_to_airport&date=2025-12-31
GET /rides?airport_id=uuid&home_postcode=75001&seats_min=2
```

Query Parameters:

- `airport_id` (required): UUID of the airport
- `direction`: `home_to_airport` or `airport_to_home`
- `date`: YYYY-MM-DD format
- `home_postcode`: Filter by postal code
- `seats_min`: Minimum available seats
- `page`: Page number (default: 1)
- `limit`: Results per page (default: 20, max: 100)

#### Get Ride Details

```http
GET /rides/:id
```

#### Get My Rides (Driver)

```http
GET /me/rides
Authorization: Bearer <access_token>
```

#### Update Ride

```http
PATCH /rides/:id
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "datetime_start": "2025-12-31T11:00:00Z",
  "price_per_seat": 20.00
}
```

#### Cancel Ride

```http
DELETE /rides/:id
Authorization: Bearer <access_token>
```

#### Get Ride Bookings (Driver)

```http
GET /rides/:id/bookings
Authorization: Bearer <access_token>
```

### Booking Endpoints

#### Create Booking (Passenger)

```http
POST /rides/:rideId/bookings
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "seats": 2
}
```

#### Get My Bookings (Passenger)

```http
GET /me/bookings
Authorization: Bearer <access_token>
```

#### Update Booking Status

```http
PATCH /bookings/:id
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "status": "accepted"
}
```

Status values:

- `accepted`: Driver accepts booking
- `rejected`: Driver rejects booking
- `cancelled`: Passenger cancels booking

## 🗄️ Database Schema

### Users

- `id` (UUID, PK)
- `email` (unique)
- `password_hash`
- `first_name`, `last_name`, `phone`
- `role` (driver | passenger | both)
- `avatar_url`
- `created_at`, `updated_at`, `deleted_at`

### Airports

- `id` (UUID, PK)
- `name`, `iata_code` (unique)
- `city`, `country`, `timezone`
- `is_active`

### Rides

- `id` (UUID, PK)
- `driver_id` (FK → users)
- `airport_id` (FK → airports)
- `direction` (home_to_airport | airport_to_home)
- `home_address`, `home_postcode`, `home_city`
- `datetime_start`
- `seats_total`, `seats_left`
- `price_per_seat`
- `comment`
- `status` (active | cancelled | completed)

### Bookings

- `id` (UUID, PK)
- `ride_id` (FK → rides)
- `passenger_id` (FK → users)
- `seats`
- `status` (pending | accepted | rejected | cancelled)

### Notifications

- `id` (UUID, PK)
- `user_id` (FK → users)
- `type`, `payload` (JSONB)
- `is_read`

## 🔒 Security Features

- Password hashing with bcrypt
- JWT-based authentication
- Access tokens (15 min expiry)
- Refresh tokens (7 day expiry)
- Input validation with Joi
- SQL injection protection (parameterized queries)
- CORS enabled
- Error handling middleware

## 🏗️ Project Structure

```
myapp-backend/
├── src/
│   ├── config/
│   │   └── database.js         # PostgreSQL connection
│   ├── controllers/            # Request handlers
│   │   ├── authController.js
│   │   ├── userController.js
│   │   ├── airportController.js
│   │   ├── rideController.js
│   │   └── bookingController.js
│   ├── middleware/             # Express middleware
│   │   ├── auth.js            # JWT authentication
│   │   ├── errorHandler.js    # Global error handling
│   │   └── validation.js      # Input validation
│   ├── models/                # Database models
│   │   ├── User.js
│   │   ├── Airport.js
│   │   ├── Ride.js
│   │   ├── Booking.js
│   │   └── Notification.js
│   ├── routes/                # Route definitions
│   │   ├── authRoutes.js
│   │   ├── userRoutes.js
│   │   ├── airportRoutes.js
│   │   ├── rideRoutes.js
│   │   └── bookingRoutes.js
│   ├── services/              # Business logic
│   │   ├── authService.js
│   │   └── notificationService.js
│   ├── utils/                 # Utilities
│   │   └── jwt.js            # JWT helper functions
│   ├── migrations/            # Database migrations
│   │   ├── 001_create_tables.sql
│   │   └── run-migration.js
│   ├── seeds/                 # Seed data
│   │   └── airports.js
│   └── app.js                # Express app setup
├── server.js                 # Server entry point
├── .env                      # Environment variables
├── package.json
└── README.md
```

## 🧪 Testing the API

You can use tools like:

- **Postman** or **Insomnia** (import collection)
- **curl** commands
- **Thunder Client** (VS Code extension)

### Example Flow

1. Register a user as "driver"
2. Login to get access token
3. Create a ride
4. Register another user as "passenger"
5. Search for rides
6. Create a booking
7. Accept the booking (as driver)

## 📝 Business Rules

### Rides

- Only drivers can create rides
- Ride date must be in the future
- Driver can update/cancel own rides
- Cancelling a ride cancels all bookings

### Bookings

- Passengers cannot book their own rides
- One booking per passenger per ride
- Cannot book if insufficient seats
- Driver can accept/reject pending bookings
- Passenger can cancel up to 24h before ride

## 🚧 Future Enhancements (V2)

- [ ] Payment integration
- [ ] Rating/review system
- [ ] Real-time chat
- [ ] Push notifications (FCM/APNs)
- [ ] Email notifications
- [ ] Multi-language support
- [ ] Admin dashboard
- [ ] Analytics & reporting
- [ ] Profile verification

## 🐛 Troubleshooting

### Database connection errors

- Verify PostgreSQL is running
- Check database credentials in `.env`
- Ensure database exists

### Migration errors

- Drop and recreate the database if needed
- Check PostgreSQL user permissions

### JWT errors

- Verify JWT secrets are set in `.env`
- Check token expiry times

## 📄 License

ISC

## 👥 Support

For issues or questions, please contact the development team.
# cov-backend
