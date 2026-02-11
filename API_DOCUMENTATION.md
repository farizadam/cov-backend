# Airport Carpooling Backend API Documentation

## Overview

Airport Carpooling is an Express.js backend API that facilitates ride-sharing between airport travelers. The API provides authentication, user management, ride creation/search, and booking functionality.

**Base URL:** `http://localhost:3000/api/v1`
**API Version:** v1

---

## Table of Contents

1. [Authentication](#authentication)
2. [Data Models](#data-models)
3. [Error Handling](#error-handling)
4. [Endpoints](#endpoints)
   - [Auth Endpoints](#auth-endpoints)
   - [User Endpoints](#user-endpoints)
   - [Airport Endpoints](#airport-endpoints)
   - [Ride Endpoints](#ride-endpoints)
   - [Booking Endpoints](#booking-endpoints)

---

## Authentication

### Token-Based Authentication

The API uses **JWT (JSON Web Tokens)** for authentication. When a user registers or logs in, they receive:

- `accessToken`: Short-lived token (use in Authorization header)
- `refreshToken`: Long-lived token (use to request new accessToken)

### How to Authenticate

Include the access token in the `Authorization` header:

```
Authorization: Bearer YOUR_ACCESS_TOKEN
```

### Token Refresh

When the access token expires, use the refresh token:

```bash
POST /api/v1/auth/refresh
Content-Type: application/json

{
  "refresh_token": "YOUR_REFRESH_TOKEN"
}
```

---

## Data Models

### User

```json
{
  "_id": "ObjectId",
  "email": "user@example.com",
  "first_name": "John",
  "last_name": "Doe",
  "phone": "+33612345678",
  "role": "driver|passenger|both",
  "avatar_url": "https://...",
  "createdAt": "2025-01-03T10:00:00Z",
  "updatedAt": "2025-01-03T10:00:00Z"
}
```

**Role Types:**

- `driver`: Can create rides
- `passenger`: Can book rides
- `both`: Can do both

### Airport

```json
{
  "_id": "ObjectId",
  "name": "Charles de Gaulle",
  "iata_code": "CDG",
  "city": "Paris",
  "country": "France",
  "timezone": "Europe/Paris",
  "is_active": true,
  "createdAt": "2025-01-03T10:00:00Z",
  "updatedAt": "2025-01-03T10:00:00Z"
}
```

### Ride

```json
{
  "_id": "ObjectId",
  "driver_id": "ObjectId",
  "airport_id": "ObjectId",
  "direction": "home_to_airport|airport_to_home",
  "home_address": "123 Main Street",
  "home_postcode": "75001",
  "home_city": "Paris",
  "datetime_start": "2025-12-31T10:00:00Z",
  "seats_total": 3,
  "seats_left": 2,
  "price_per_seat": 15.0,
  "comment": "Friendly driver, music lover",
  "status": "active|cancelled|completed",
  "createdAt": "2025-01-03T10:00:00Z",
  "updatedAt": "2025-01-03T10:00:00Z"
}
```

**Direction:**

- `home_to_airport`: Ride from home to airport (departure)
- `airport_to_home`: Ride from airport to home (arrival)

**Status:**

- `active`: Ride is available for booking
- `cancelled`: Ride has been cancelled
- `completed`: Ride has occurred

### Booking

```json
{
  "_id": "ObjectId",
  "ride_id": "ObjectId",
  "passenger_id": "ObjectId",
  "seats": 2,
  "status": "pending|accepted|rejected|cancelled",
  "createdAt": "2025-01-03T10:00:00Z",
  "updatedAt": "2025-01-03T10:00:00Z"
}
```

**Status:**

- `pending`: Awaiting driver approval
- `accepted`: Driver approved the booking
- `rejected`: Driver rejected the booking
- `cancelled`: Passenger cancelled the booking

---

## Error Handling

All error responses follow this format:

```json
{
  "success": false,
  "message": "Error description"
}
```

**Common HTTP Status Codes:**

- `400` Bad Request - Validation error or missing required fields
- `401` Unauthorized - Invalid or missing authentication token
- `403` Forbidden - User doesn't have permission (e.g., passenger trying to create a ride)
- `404` Not Found - Resource not found
- `409` Conflict - Resource already exists (e.g., email already registered)
- `500` Internal Server Error - Server-side error

---

## Endpoints

### Auth Endpoints

#### Register User

Create a new user account.

**Request**

```http
POST /api/v1/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "Password123!",
  "first_name": "John",
  "last_name": "Doe",
  "phone": "+33612345678",
  "role": "driver"
}
```

**Validation Rules:**

- `email`: Valid email format, unique
- `password`: Min 8 chars, uppercase, lowercase, number, special char
- `first_name`: Min 2, max 100 chars
- `last_name`: Min 2, max 100 chars
- `phone`: Valid international phone format (+33...)
- `role`: One of `driver`, `passenger`, `both`

**Response (201 Created)**

```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "user": {
      "_id": "670a1c2b3e4f5a6b7c8d9e0f",
      "email": "user@example.com",
      "first_name": "John",
      "last_name": "Doe",
      "phone": "+33612345678",
      "role": "driver",
      "avatar_url": null,
      "createdAt": "2025-01-03T10:00:00Z",
      "updatedAt": "2025-01-03T10:00:00Z"
    },
    "accessToken": "eyJhbGc...",
    "refreshToken": "eyJhbGc..."
  }
}
```

---

#### Login User

Authenticate and receive tokens.

**Request**

```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "Password123!"
}
```

**Response (200 OK)**

```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      /* User object */
    },
    "accessToken": "eyJhbGc...",
    "refreshToken": "eyJhbGc..."
  }
}
```

**Error Response (401 Unauthorized)**

```json
{
  "success": false,
  "message": "Invalid email or password"
}
```

---

#### Refresh Token

Get a new access token using refresh token.

**Request**

```http
POST /api/v1/auth/refresh
Content-Type: application/json

{
  "refresh_token": "eyJhbGc..."
}
```

**Response (200 OK)**

```json
{
  "success": true,
  "message": "Token refreshed successfully",
  "data": {
    "user": {
      /* User object */
    },
    "accessToken": "eyJhbGc...",
    "refreshToken": "eyJhbGc..."
  }
}
```

---

#### Logout

Invalidate user session (protected).

**Request**

```http
POST /api/v1/auth/logout
Authorization: Bearer YOUR_ACCESS_TOKEN
```

**Response (200 OK)**

```json
{
  "success": true,
  "message": "Logout successful"
}
```

---

#### Delete Account

Permanently delete user account (protected).

**Request**

```http
DELETE /api/v1/auth/me
Authorization: Bearer YOUR_ACCESS_TOKEN
```

**Response (200 OK)**

```json
{
  "success": true,
  "message": "Account deleted successfully"
}
```

---

### User Endpoints

All user endpoints require authentication.

#### Get Profile

Retrieve current user profile.

**Request**

```http
GET /api/v1/users/me
Authorization: Bearer YOUR_ACCESS_TOKEN
```

**Response (200 OK)**

```json
{
  "success": true,
  "data": {
    "_id": "670a1c2b3e4f5a6b7c8d9e0f",
    "email": "user@example.com",
    "first_name": "John",
    "last_name": "Doe",
    "phone": "+33612345678",
    "role": "driver",
    "avatar_url": null,
    "createdAt": "2025-01-03T10:00:00Z",
    "updatedAt": "2025-01-03T10:00:00Z"
  }
}
```

---

#### Update Profile

Update user information (all fields optional).

**Request**

```http
PATCH /api/v1/users/me
Authorization: Bearer YOUR_ACCESS_TOKEN
Content-Type: application/json

{
  "first_name": "Jane",
  "phone": "+33687654321",
  "role": "both",
  "avatar_url": "https://example.com/avatar.jpg"
}
```

**Validation Rules:**

- `first_name`: Min 2, max 100 chars
- `last_name`: Min 2, max 100 chars
- `phone`: Valid international format
- `role`: One of `driver`, `passenger`, `both`
- `avatar_url`: Valid URL or null

**Response (200 OK)**

```json
{
  "success": true,
  "message": "Profile updated successfully",
  "data": {
    /* Updated user object */
  }
}
```

---

### Airport Endpoints

All airport endpoints are public (no authentication required).

#### Get All Airports

Retrieve list of all airports.

**Request**

```http
GET /api/v1/airports
```

**Response (200 OK)**

```json
{
  "success": true,
  "data": [
    {
      "_id": "670a1c2b3e4f5a6b7c8d9e01",
      "name": "Charles de Gaulle",
      "iata_code": "CDG",
      "city": "Paris",
      "country": "France",
      "timezone": "Europe/Paris",
      "is_active": true,
      "createdAt": "2025-01-03T10:00:00Z",
      "updatedAt": "2025-01-03T10:00:00Z"
    },
    {
      "_id": "670a1c2b3e4f5a6b7c8d9e02",
      "name": "Orly",
      "iata_code": "ORY",
      "city": "Paris",
      "country": "France",
      "timezone": "Europe/Paris",
      "is_active": true,
      "createdAt": "2025-01-03T10:00:00Z",
      "updatedAt": "2025-01-03T10:00:00Z"
    }
  ]
}
```

---

#### Get Airport by ID

Retrieve specific airport details.

**Request**

```http
GET /api/v1/airports/:id
```

**Response (200 OK)**

```json
{
  "success": true,
  "data": {
    /* Airport object */
  }
}
```

**Error Response (404 Not Found)**

```json
{
  "success": false,
  "message": "Airport not found"
}
```

---

### Ride Endpoints

#### Create Ride

Create a new ride (protected, drivers only).

**Request**

```http
POST /api/v1/rides
Authorization: Bearer YOUR_ACCESS_TOKEN
Content-Type: application/json

{
  "airport_id": "670a1c2b3e4f5a6b7c8d9e01",
  "direction": "home_to_airport",
  "home_address": "123 Main Street",
  "home_postcode": "75001",
  "home_city": "Paris",
  "datetime_start": "2025-12-31T10:00:00Z",
  "seats_total": 3,
  "price_per_seat": 15.00,
  "comment": "Non-smoker, music lover"
}
```

**Validation Rules:**

- `airport_id`: Valid MongoDB ObjectId
- `direction`: One of `home_to_airport`, `airport_to_home`
- `home_postcode`: Max 10 chars
- `home_city`: Max 100 chars
- `datetime_start`: ISO datetime in the future
- `seats_total`: Integer >= 1
- `price_per_seat`: Positive number with max 2 decimals
- `comment`: Max 1000 chars (optional)
- `home_address`: Max 500 chars (optional)

**Response (201 Created)**

```json
{
  "success": true,
  "message": "Ride created successfully",
  "data": {
    "_id": "670a1c2b3e4f5a6b7c8d9e10",
    "driver_id": "670a1c2b3e4f5a6b7c8d9e0f",
    "airport_id": "670a1c2b3e4f5a6b7c8d9e01",
    "direction": "home_to_airport",
    "home_address": "123 Main Street",
    "home_postcode": "75001",
    "home_city": "Paris",
    "datetime_start": "2025-12-31T10:00:00Z",
    "seats_total": 3,
    "seats_left": 3,
    "price_per_seat": 15.0,
    "comment": "Non-smoker, music lover",
    "status": "active",
    "createdAt": "2025-01-03T10:00:00Z",
    "updatedAt": "2025-01-03T10:00:00Z"
  }
}
```

**Error Response (403 Forbidden)**

```json
{
  "success": false,
  "message": "Only drivers can create rides"
}
```

---

#### Search Rides

Search for available rides with filters.

**Request**

```http
GET /api/v1/rides/search?airport_id=670a1c2b3e4f5a6b7c8d9e01&direction=home_to_airport&date=2025-12-31&home_postcode=75001&seats_min=2&page=1&limit=20
```

**Query Parameters:**

- `airport_id` (required): Airport MongoDB ObjectId
- `direction` (optional): `home_to_airport` or `airport_to_home`
- `date` (optional): Search date (YYYY-MM-DD format)
- `home_postcode` (optional): Filter by postcode
- `seats_min` (optional): Minimum seats needed
- `page` (optional, default: 1): Page number for pagination
- `limit` (optional, default: 20, max: 100): Results per page

**Response (200 OK)**

```json
{
  "success": true,
  "data": [
    {
      "_id": "670a1c2b3e4f5a6b7c8d9e10",
      "driver_id": "670a1c2b3e4f5a6b7c8d9e0f",
      "airport_id": "670a1c2b3e4f5a6b7c8d9e01",
      "direction": "home_to_airport",
      "home_address": "123 Main Street",
      "home_postcode": "75001",
      "home_city": "Paris",
      "datetime_start": "2025-12-31T10:00:00Z",
      "seats_total": 3,
      "seats_left": 2,
      "price_per_seat": 15.0,
      "comment": "Non-smoker, music lover",
      "status": "active",
      "driver_first_name": "John",
      "driver_last_name": "Doe",
      "driver_avatar": null,
      "airport_name": "Charles de Gaulle",
      "airport_code": "CDG",
      "createdAt": "2025-01-03T10:00:00Z",
      "updatedAt": "2025-01-03T10:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "count": 1
  }
}
```

---

#### Get Ride by ID

Retrieve specific ride details with driver and airport info.

**Request**

```http
GET /api/v1/rides/:id
```

**Response (200 OK)**

```json
{
  "success": true,
  "data": {
    "_id": "670a1c2b3e4f5a6b7c8d9e10",
    "driver_id": {
      "_id": "670a1c2b3e4f5a6b7c8d9e0f",
      "first_name": "John",
      "last_name": "Doe",
      "phone": "+33612345678",
      "avatar_url": null
    },
    "airport_id": {
      "_id": "670a1c2b3e4f5a6b7c8d9e01",
      "name": "Charles de Gaulle",
      "iata_code": "CDG",
      "city": "Paris"
    },
    "direction": "home_to_airport",
    "home_address": "123 Main Street",
    "home_postcode": "75001",
    "home_city": "Paris",
    "datetime_start": "2025-12-31T10:00:00Z",
    "seats_total": 3,
    "seats_left": 2,
    "price_per_seat": 15.0,
    "comment": "Non-smoker, music lover",
    "status": "active",
    "createdAt": "2025-01-03T10:00:00Z",
    "updatedAt": "2025-01-03T10:00:00Z"
  }
}
```

---

#### Get My Rides

Retrieve all rides created by current user (protected).

**Request**

```http
GET /api/v1/rides/driver
Authorization: Bearer YOUR_ACCESS_TOKEN
```

**Response (200 OK)**

```json
{
  "success": true,
  "data": [
    /* Array of ride objects */
  ]
}
```

---

#### Update Ride

Update ride details (protected, driver only).

**Request**

```http
PATCH /api/v1/rides/:id
Authorization: Bearer YOUR_ACCESS_TOKEN
Content-Type: application/json

{
  "datetime_start": "2025-12-31T11:00:00Z",
  "seats_total": 4,
  "price_per_seat": 18.00,
  "comment": "Updated comment"
}
```

**Validation Rules:**

- `datetime_start`: ISO datetime in the future
- `seats_total`: Integer >= 1
- `price_per_seat`: Positive number
- `comment`: Max 1000 chars
- `home_address`: Max 500 chars
- `home_postcode`: Max 10 chars
- `home_city`: Max 100 chars
- At least one field required

**Response (200 OK)**

```json
{
  "success": true,
  "message": "Ride updated successfully",
  "data": {
    /* Updated ride object */
  }
}
```

---

#### Cancel Ride

Cancel a ride (protected, driver only).

**Request**

```http
DELETE /api/v1/rides/:id
Authorization: Bearer YOUR_ACCESS_TOKEN
```

**Response (200 OK)**

```json
{
  "success": true,
  "message": "Ride cancelled successfully"
}
```

---

#### Get Ride Bookings

Retrieve all bookings for a specific ride (protected, driver only).

**Request**

```http
GET /api/v1/rides/:id/bookings
Authorization: Bearer YOUR_ACCESS_TOKEN
```

**Response (200 OK)**

```json
{
  "success": true,
  "data": [
    {
      "_id": "670a1c2b3e4f5a6b7c8d9e20",
      "ride_id": "670a1c2b3e4f5a6b7c8d9e10",
      "passenger_id": {
        "_id": "670a1c2b3e4f5a6b7c8d9e15",
        "first_name": "Jane",
        "last_name": "Smith"
      },
      "seats": 2,
      "status": "pending",
      "createdAt": "2025-01-03T10:00:00Z",
      "updatedAt": "2025-01-03T10:00:00Z"
    }
  ]
}
```

---

### Booking Endpoints

All booking endpoints require authentication.

#### Create Booking

Book seats on a ride (protected).

**Request**

```http
POST /api/v1/rides/:rideId/bookings
Authorization: Bearer YOUR_ACCESS_TOKEN
Content-Type: application/json

{
  "seats": 2
}
```

**Validation Rules:**

- `seats`: Integer >= 1

**Response (201 Created)**

```json
{
  "success": true,
  "message": "Booking created successfully",
  "data": {
    "_id": "670a1c2b3e4f5a6b7c8d9e20",
    "ride_id": "670a1c2b3e4f5a6b7c8d9e10",
    "passenger_id": "670a1c2b3e4f5a6b7c8d9e15",
    "seats": 2,
    "status": "pending",
    "createdAt": "2025-01-03T10:00:00Z",
    "updatedAt": "2025-01-03T10:00:00Z"
  }
}
```

**Error Response (409 Conflict)**

```json
{
  "success": false,
  "message": "You already have a booking for this ride"
}
```

---

#### Get My Bookings

Retrieve all bookings made by current user (protected).

**Request**

```http
GET /api/v1/me/bookings
Authorization: Bearer YOUR_ACCESS_TOKEN
```

**Response (200 OK)**

```json
{
  "success": true,
  "data": [
    {
      "_id": "670a1c2b3e4f5a6b7c8d9e20",
      "ride_id": {
        "_id": "670a1c2b3e4f5a6b7c8d9e10",
        "direction": "home_to_airport",
        "datetime_start": "2025-12-31T10:00:00Z",
        "price_per_seat": 15.0,
        "driver_id": {
          "first_name": "John",
          "last_name": "Doe"
        }
      },
      "passenger_id": "670a1c2b3e4f5a6b7c8d9e15",
      "seats": 2,
      "status": "accepted",
      "createdAt": "2025-01-03T10:00:00Z",
      "updatedAt": "2025-01-03T10:00:00Z"
    }
  ]
}
```

---

#### Update Booking Status

Accept, reject, or cancel a booking (protected, driver for accept/reject).

**Request**

```http
PATCH /api/v1/bookings/:id
Authorization: Bearer YOUR_ACCESS_TOKEN
Content-Type: application/json

{
  "status": "accepted"
}
```

**Valid Status Values:**

- `accepted`: Driver approves booking (driver only)
- `rejected`: Driver rejects booking (driver only)
- `cancelled`: Passenger cancels booking (passenger only)

**Response (200 OK)**

```json
{
  "success": true,
  "message": "Booking status updated successfully",
  "data": {
    "_id": "670a1c2b3e4f5a6b7c8d9e20",
    "ride_id": "670a1c2b3e4f5a6b7c8d9e10",
    "passenger_id": "670a1c2b3e4f5a6b7c8d9e15",
    "seats": 2,
    "status": "accepted",
    "createdAt": "2025-01-03T10:00:00Z",
    "updatedAt": "2025-01-03T10:00:00Z"
  }
}
```

---

## Quick Reference

### Authentication Flow

```
1. POST /auth/register → Get accessToken + refreshToken
2. Use accessToken in Authorization header for protected routes
3. When accessToken expires: POST /auth/refresh with refreshToken
4. POST /auth/logout to end session
```

### Driver Flow

```
1. Register with role="driver" or role="both"
2. POST /rides → Create a new ride
3. GET /rides/driver → View your rides
4. GET /rides/:id/bookings → See passenger bookings
5. PATCH /bookings/:id → Accept/reject bookings
```

### Passenger Flow

```
1. Register with role="passenger" or role="both"
2. GET /airports → Find airports
3. GET /rides/search → Search available rides
4. GET /rides/:id → View ride details
5. POST /rides/:rideId/bookings → Book a ride
6. GET /me/bookings → View your bookings
7. PATCH /bookings/:id → Cancel booking if needed
```

---

## Environment Setup

### Required Environment Variables

```
NODE_ENV=development
PORT=3000
MONGODB_URI=mongodb://localhost:27017/airport_carpooling
JWT_SECRET=your_jwt_secret_key
JWT_REFRESH_SECRET=your_refresh_secret_key
```

### Development Server

```bash
npm install
npm run dev
```

### Seed Database with Airports

```bash
npm run seed
```

---

## Support

For issues or questions about the API, please contact the backend development team.
