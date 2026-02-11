# Frontend Development Prompt: Airport Carpooling Application

## Project Overview

Build a modern, responsive web application for an Airport Carpooling platform that connects drivers and passengers traveling to/from airports. The application should provide an intuitive interface for users to create rides, search for available rides, and manage bookings.

---

## Backend API

The backend API is already built and documented. Reference the complete API documentation in `API_DOCUMENTATION.md` for all endpoints, request/response formats, and authentication details.

**Base API URL:** `http://localhost:3000/api/v1`

---

## Technology Stack Recommendations

### Core Framework (Choose One)

- **React** with React Router (recommended for flexibility)
- **Next.js** (recommended for SSR and better SEO)
- **Vue.js** with Vue Router
- **Angular** (for enterprise-level features)

### Essential Libraries

- **State Management:**

  - React: Redux Toolkit, Zustand, or React Context
  - Vue: Pinia or Vuex
  - Angular: NgRx

- **HTTP Client:** Axios or Fetch API

- **Form Handling:**

  - React Hook Form (React)
  - Formik (React)
  - VeeValidate (Vue)

- **UI Component Library (Optional):**

  - Material-UI (MUI)
  - Ant Design
  - Chakra UI
  - Tailwind CSS + Headless UI
  - shadcn/ui

- **Date/Time Handling:** date-fns or Day.js

- **Authentication:** JWT storage in localStorage/sessionStorage with axios interceptors

---

## Required Pages & Features

### 1. Authentication Pages

#### Landing Page (`/`)

- Hero section with app description
- Call-to-action buttons (Sign Up, Login)
- Features showcase (find rides, offer rides, save money)
- How it works section
- Footer with links

#### Sign Up Page (`/register`)

- Registration form with fields:
  - Email (with validation)
  - Password (with strength indicator)
  - Confirm Password
  - First Name
  - Last Name
  - Phone Number (with international format)
  - Role Selection (Driver, Passenger, Both)
- Form validation matching backend rules
- Error handling for existing email
- Redirect to dashboard on success

#### Login Page (`/login`)

- Email and password fields
- "Remember me" option
- "Forgot password" link (UI only for now)
- Error handling for invalid credentials
- Redirect to dashboard on success

---

### 2. Main Application Pages

#### Dashboard (`/dashboard`)

**For All Users:**

- Welcome message with user's name
- Quick stats cards:
  - Upcoming rides (as passenger)
  - Active rides (as driver)
  - Total bookings
- Quick action buttons based on role
- Recent activity feed

**For Drivers:**

- "Create New Ride" button (prominent)
- List of upcoming rides they're driving
- Pending booking requests with accept/reject actions

**For Passengers:**

- "Search Rides" button (prominent)
- List of their bookings with status
- Quick search form for rides

---

#### Search Rides Page (`/rides/search`)

- Search form with filters:
  - Airport dropdown (required) - populated from `/api/v1/airports`
  - Direction: "To Airport" or "From Airport"
  - Date picker (default: today)
  - Postcode (optional)
  - Minimum seats needed
- Search results displayed as cards showing:
  - Driver name and avatar
  - Airport name and code
  - Direction
  - Departure date and time
  - Available seats
  - Price per seat
  - Home city/postcode
  - "View Details" button
- Empty state when no rides found
- Pagination controls
- Loading states

---

#### Ride Details Page (`/rides/:id`)

- Full ride information:
  - Driver details (name, avatar, phone)
  - Airport information
  - Direction indicator with icon
  - Full address (if provided)
  - Date and time (formatted nicely)
  - Seats available / total
  - Price per seat (prominent)
  - Driver comments
  - Status badge
- "Book This Ride" button (if passenger)
  - Opens booking modal with seat selection
- "Edit Ride" button (if owner and driver)
- "Cancel Ride" button (if owner and driver)
- Back to search button

---

#### Create Ride Page (`/rides/create`)

**Accessible only to drivers**

- Multi-step form or single page form:
  - **Step 1: Trip Details**
    - Airport selection (dropdown)
    - Direction (radio buttons with icons)
    - Date and time picker (future dates only)
  - **Step 2: Location**
    - Home address (optional)
    - Postcode (required)
    - City (required)
  - **Step 3: Ride Details**
    - Total seats available (number input)
    - Price per seat (currency input)
    - Comments (textarea)
- Form validation matching backend rules
- Submit button with loading state
- Success redirect to "My Rides"

---

#### My Rides Page (`/rides/my-rides`)

**For Drivers:**

- List of all rides they created
- Tabs: "Upcoming", "Past", "Cancelled"
- Each ride card shows:
  - Route (city → airport or vice versa)
  - Date and time
  - Seats status (booked/total)
  - Number of pending bookings (badge)
  - Actions: View, Edit, Cancel
- Click on ride to see booking requests
- Empty state with "Create Ride" CTA

---

#### My Bookings Page (`/bookings`)

**For Passengers:**

- List of all their bookings
- Status tabs: "Pending", "Accepted", "Cancelled"
- Each booking card shows:
  - Ride details (route, date, driver)
  - Number of seats booked
  - Total price
  - Status badge
  - Driver contact (if accepted)
  - Cancel button (if pending/accepted)
- Empty state with "Search Rides" CTA

---

#### Ride Bookings Page (`/rides/:id/bookings`)

**For Drivers - View bookings for their ride:**

- List of all booking requests
- Each booking shows:
  - Passenger name
  - Seats requested
  - Booking date
  - Status
  - Accept/Reject buttons (if pending)
- Real-time seat availability counter
- Cannot accept if insufficient seats

---

#### Profile Page (`/profile`)

- Display user information:
  - Avatar (with upload option)
  - Name
  - Email
  - Phone
  - Role
- Edit profile form
- Change password section (UI only)
- Delete account button (with confirmation modal)
- Logout button

---

## Key Features & Functionality

### Authentication & Authorization

1. **JWT Token Management:**

   - Store accessToken and refreshToken in localStorage
   - Include accessToken in Authorization header for all protected routes
   - Implement token refresh logic when access token expires
   - Clear tokens on logout

2. **Protected Routes:**

   - Redirect to login if not authenticated
   - Redirect drivers from booking pages if they don't have passenger role
   - Redirect passengers from create ride page if they don't have driver role

3. **Axios Interceptor Setup:**

   ```javascript
   // Request interceptor - add token
   axios.interceptors.request.use((config) => {
     const token = localStorage.getItem("accessToken");
     if (token) {
       config.headers.Authorization = `Bearer ${token}`;
     }
     return config;
   });

   // Response interceptor - handle token refresh
   axios.interceptors.response.use(
     (response) => response,
     async (error) => {
       if (error.response?.status === 401) {
         // Try to refresh token
         // If refresh fails, logout user
       }
       return Promise.reject(error);
     }
   );
   ```

---

### Search & Filtering

- Implement client-side and server-side filtering
- Debounce search inputs for better performance
- Display loading skeletons during search
- Show search result count
- Save recent searches (optional)

---

### Booking Flow

1. User searches for rides
2. Clicks on ride to view details
3. Clicks "Book" button
4. Modal/form appears to select number of seats
5. Validates seat availability
6. Submits booking (status: pending)
7. Success notification
8. Redirect to My Bookings

---

### Ride Management (Drivers)

1. **Create Ride:**

   - Validate all fields
   - Show date/time picker with timezone handling
   - Preview ride before submission
   - Success notification with link to ride

2. **Edit Ride:**

   - Pre-populate form with existing data
   - Disable airport/direction changes
   - Validate new datetime is in future
   - Update seats only if >= current bookings

3. **Cancel Ride:**

   - Confirmation modal
   - Show warning if bookings exist
   - Update status to cancelled
   - Notify passengers (backend handles this)

4. **Manage Bookings:**
   - View all booking requests
   - Accept/reject with single click
   - Real-time seat counter
   - Cannot over-book seats

---

### Notifications & Feedback

- Toast notifications for:
  - Successful actions (create, update, delete)
  - Errors (validation, network, etc.)
  - Booking status changes
- Loading states for all async operations
- Empty states with helpful CTAs
- Error boundaries for graceful error handling

---

## UI/UX Requirements

### Design Principles

1. **Mobile-First:** Fully responsive on all devices
2. **Intuitive Navigation:** Clear menu structure
3. **Accessibility:** WCAG 2.1 AA compliant
4. **Fast Loading:** Optimize images, lazy load components
5. **Visual Feedback:** Loading states, hover effects, transitions

### Color Scheme Suggestions

- Primary: Blue (#2563EB) - trust, travel
- Secondary: Green (#10B981) - eco-friendly
- Success: Green (#22C55E)
- Warning: Amber (#F59E0B)
- Error: Red (#EF4444)
- Neutral: Gray scale

### Component Patterns

- **Cards:** For ride listings, bookings
- **Modals:** For confirmations, booking forms
- **Badges:** For status indicators
- **Chips/Tags:** For filters, selected options
- **Tabs:** For categorizing content
- **Skeleton Loaders:** During data fetching

---

## State Management Structure

### Global State (Redux/Pinia/Context)

```javascript
{
  auth: {
    user: null | User,
    accessToken: string,
    refreshToken: string,
    isAuthenticated: boolean,
    loading: boolean
  },
  rides: {
    searchResults: Ride[],
    myRides: Ride[],
    currentRide: Ride | null,
    filters: SearchFilters,
    loading: boolean
  },
  bookings: {
    myBookings: Booking[],
    rideBookings: Booking[],
    loading: boolean
  },
  airports: {
    list: Airport[],
    loading: boolean
  },
  ui: {
    notifications: Notification[],
    modals: { [key: string]: boolean }
  }
}
```

---

## API Integration Examples

### Register User

```javascript
const register = async (userData) => {
  try {
    const response = await axios.post("/api/v1/auth/register", userData);
    const { user, accessToken, refreshToken } = response.data.data;

    // Store tokens
    localStorage.setItem("accessToken", accessToken);
    localStorage.setItem("refreshToken", refreshToken);

    // Update state
    dispatch(setUser(user));

    // Redirect to dashboard
    navigate("/dashboard");
  } catch (error) {
    // Handle error
    showNotification(
      error.response?.data?.message || "Registration failed",
      "error"
    );
  }
};
```

### Search Rides

```javascript
const searchRides = async (filters) => {
  try {
    setLoading(true);
    const params = new URLSearchParams({
      airport_id: filters.airportId,
      direction: filters.direction,
      date: filters.date,
      home_postcode: filters.postcode,
      seats_min: filters.seatsMin,
      page: filters.page,
      limit: filters.limit,
    });

    const response = await axios.get(`/api/v1/rides/search?${params}`);
    const { data, pagination } = response.data;

    setRides(data);
    setPagination(pagination);
  } catch (error) {
    showNotification("Failed to search rides", "error");
  } finally {
    setLoading(false);
  }
};
```

### Create Booking

```javascript
const createBooking = async (rideId, seats) => {
  try {
    const response = await axios.post(`/api/v1/rides/${rideId}/bookings`, {
      seats,
    });

    showNotification("Booking created successfully!", "success");
    navigate("/bookings");
  } catch (error) {
    const message = error.response?.data?.message || "Booking failed";
    showNotification(message, "error");
  }
};
```

---

## Validation Rules (Frontend)

Match backend validation for better UX:

### Registration

- Email: Valid email format
- Password: Min 8 chars, must include uppercase, lowercase, number, special char
- First Name: Min 2, max 100 chars
- Last Name: Min 2, max 100 chars
- Phone: International format (+33...)
- Role: Required selection

### Ride Creation

- Airport: Required selection
- Direction: Required
- Date/Time: Must be in future
- Postcode: Max 10 chars, required
- City: Max 100 chars, required
- Seats: Min 1, integer
- Price: Positive number, max 2 decimals
- Address: Max 500 chars, optional
- Comment: Max 1000 chars, optional

### Booking

- Seats: Min 1, cannot exceed available seats

---

## Error Handling

### HTTP Error Codes

- **400:** Display validation errors under form fields
- **401:** Redirect to login, clear tokens
- **403:** Show permission denied message
- **404:** Show not found page
- **409:** Display conflict message (e.g., "Email already exists")
- **500:** Show generic error, log to console

### Network Errors

- Show "Connection lost" message
- Implement retry logic
- Cache recent data for offline viewing (optional)

---

## Testing Requirements

### Unit Tests

- Component rendering
- Form validation logic
- State management actions
- Utility functions

### Integration Tests

- Authentication flow
- Search and filter functionality
- Booking creation
- Ride management

### E2E Tests (Optional)

- Complete user journeys
- Critical paths (register → search → book)

---

## Performance Optimization

1. **Code Splitting:** Lazy load routes and heavy components
2. **Image Optimization:** Use WebP format, lazy loading
3. **Caching:** Cache API responses, implement stale-while-revalidate
4. **Bundle Size:** Tree-shake unused code, analyze bundle
5. **Memoization:** Use React.memo, useMemo, useCallback appropriately

---

## Accessibility Checklist

- [ ] Keyboard navigation works throughout
- [ ] Proper focus management (modals, forms)
- [ ] ARIA labels on interactive elements
- [ ] Semantic HTML (nav, main, section, article)
- [ ] Alt text on all images
- [ ] Color contrast meets WCAG AA standards
- [ ] Form inputs have labels
- [ ] Error messages are announced to screen readers
- [ ] Skip navigation links

---

## Deployment Considerations

### Environment Variables

```env
REACT_APP_API_BASE_URL=http://localhost:3000/api/v1
REACT_APP_ENV=development
```

### Production Build

- Minify and optimize bundle
- Enable compression (gzip/brotli)
- Configure CDN for static assets
- Set up error tracking (Sentry, LogRocket)
- Implement analytics (Google Analytics, Mixpanel)

---

## Optional Enhancements

1. **Real-time Updates:** WebSocket for booking notifications
2. **Chat Feature:** In-app messaging between driver and passenger
3. **Rating System:** Rate drivers and passengers after ride
4. **Payment Integration:** Stripe/PayPal for secure payments
5. **Maps Integration:** Google Maps for route visualization
6. **Push Notifications:** Browser notifications for booking updates
7. **Multi-language Support:** i18n for internationalization
8. **Dark Mode:** Theme toggle
9. **Progressive Web App:** Offline support, installable
10. **Social Login:** Google, Facebook OAuth

---

## Deliverables

1. **Source Code:** Well-organized, commented code
2. **README.md:** Setup instructions, environment variables, scripts
3. **Component Documentation:** Storybook (optional)
4. **Deployment Guide:** Steps to deploy to production
5. **User Guide:** Basic usage instructions (optional)

---

## Timeline Estimate

- **Week 1:** Project setup, authentication, routing
- **Week 2:** Dashboard, search functionality, ride details
- **Week 3:** Create ride, booking system
- **Week 4:** Profile management, ride/booking management
- **Week 5:** Testing, bug fixes, optimization
- **Week 6:** Final polish, deployment, documentation

---

## Success Criteria

✅ Users can register, login, and manage their profile
✅ Drivers can create, edit, and cancel rides
✅ Passengers can search for rides with filters
✅ Passengers can book rides and manage bookings
✅ Drivers can accept/reject booking requests
✅ All forms have proper validation
✅ Application is fully responsive
✅ Error handling is comprehensive
✅ Loading states are implemented
✅ Token refresh works seamlessly
✅ Application is accessible (WCAG AA)

---

## Reference Files

- **API Documentation:** `API_DOCUMENTATION.md` - Complete endpoint reference
- **Backend Code:** Explore `src/` for data models and validation logic
- **Seed Data:** Check `src/seeds/airports.js` for airport examples

---

## Getting Started

1. Review the API documentation thoroughly
2. Set up your preferred frontend framework
3. Create basic routing structure
4. Implement authentication first
5. Build core features incrementally
6. Test each feature before moving to the next
7. Optimize and refine UI/UX
8. Deploy and gather feedback

**Good luck building an amazing Airport Carpooling app! 🚗✈️**
