# Airport Carpooling Backend - Quick Start (MongoDB)

## Prerequisites

- Node.js (v16+)
- MongoDB (v5+)

## Installation

```bash
npm install
```

## Setup MongoDB

### Option 1: Local MongoDB

Install and start MongoDB:

```bash
# Ubuntu/Debian
sudo apt-get install mongodb
sudo systemctl start mongodb
sudo systemctl enable mongodb

# macOS
brew install mongodb-community
brew services start mongodb-community

# Check if MongoDB is running
mongosh --eval "db.version()"
```

### Option 2: MongoDB Atlas (Cloud)

1. Create a free account at https://www.mongodb.com/atlas
2. Create a cluster
3. Get your connection string
4. Update `.env`: `MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/airport_carpooling`

## Configure Environment

Create a `.env` file in the project root and add your MongoDB URI:

```env
# For local MongoDB
MONGODB_URI=mongodb://localhost:27017/airport_carpooling

# For MongoDB Atlas
# MONGODB_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/airport_carpooling
```

## Seed Database

```bash
npm run seed
```

## Start Server

```bash
npm run dev
```

## Test the API

Visit: http://localhost:3000

## API Endpoints

- **Auth**: `/api/v1/auth` (register, login, refresh, logout)
- **Users**: `/api/v1/users` (profile)
- **Airports**: `/api/v1/airports` (list, get)
- **Rides**: `/api/v1/rides` (create, search, update, cancel)
- **Bookings**: `/api/v1/rides/:id/bookings` (create, update)

## Example: Register & Create Ride

```bash
# 1. Register
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "driver@example.com",
    "password": "password123",
    "first_name": "John",
    "last_name": "Doe",
    "phone": "+33612345678",
    "role": "driver"
  }'

# 2. Create a ride (use the accessToken from registration)
curl -X POST http://localhost:3000/api/v1/rides \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "airport_id": "GET_FROM_/airports_ENDPOINT",
    "direction": "home_to_airport",
    "home_postcode": "75001",
    "home_city": "Paris",
    "datetime_start": "2025-12-31T10:00:00Z",
    "seats_total": 3,
    "price_per_seat": 15.00
  }'
```

See README.md for full documentation.
