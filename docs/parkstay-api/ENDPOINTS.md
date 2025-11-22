# ParkStay API Endpoints

## Base URLs

- **Production**: `https://parkstay.dbca.wa.gov.au`
- **API Base**: `https://parkstay.dbca.wa.gov.au/api`
- **UAT Environment**: `https://parkstayv2-uat.dbca.wa.gov.au`
- **Auth Gateway**: `https://auth2.dbca.wa.gov.au`
- **Queue System**: `https://queue.dbca.wa.gov.au`

## Authentication

All API requests require authentication via session cookies obtained through the Azure AD B2C OAuth2 flow. See [AUTHENTICATION_FLOW.md](./AUTHENTICATION_FLOW.md) for details.

### Required Headers

```http
Cookie: sessionid=xxx; csrftoken=yyy
X-CSRFToken: yyy
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36
Accept: application/json
Accept-Language: en-AU,en;q=0.9
```

### CSRF Protection

For POST, PUT, PATCH, DELETE requests:
- Extract CSRF token from `csrftoken` cookie
- Include in `X-CSRFToken` header OR in form data as `csrfmiddlewaretoken`

## API Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        Client Application                    │
└────────────────────┬────────────────────────────────────────┘
                     │
                     │ HTTPS + Session Cookies
                     │
┌────────────────────▼────────────────────────────────────────┐
│                    ParkStay Django Backend                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                  Authentication Layer                 │   │
│  │          (Session + CSRF + Azure AD B2C)             │   │
│  └──────────────────────────────────────────────────────┘   │
│                           │                                  │
│  ┌────────────────────────▼──────────────────────────────┐  │
│  │                    API Endpoints                       │  │
│  │  ┌──────────┬──────────┬──────────┬─────────────┐    │  │
│  │  │  Search  │Availability│ Booking │   Account   │    │  │
│  │  └──────────┴──────────┴──────────┴─────────────┘    │  │
│  └────────────────────────────────────────────────────────┘  │
│                           │                                  │
│  ┌────────────────────────▼──────────────────────────────┐  │
│  │               Business Logic Layer                     │  │
│  │         (Validation, Rules, Availability Check)        │  │
│  └────────────────────────────────────────────────────────┘  │
│                           │                                  │
│  ┌────────────────────────▼──────────────────────────────┐  │
│  │            Django ORM + PostgreSQL                     │  │
│  └────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## 1. Authentication Endpoints

### 1.1 Initiate SSO Login

**Endpoint**: `GET /ssologin`

**Description**: Initiates the SSO authentication flow, redirecting to Azure AD B2C.

**Parameters**: None

**Response**: HTTP 302 Redirect to Azure AD B2C authorization endpoint

**Notes**:
- Initiates OAuth2 Authorization Code flow
- Redirects to `auth2.dbca.wa.gov.au/sso/auth_local`
- Eventually redirects to Azure AD B2C

---

### 1.2 Validate Session

**Endpoint**: `GET /api/account/`

**Description**: Validates current session and returns user information.

**Authentication**: Required (session cookie)

**Response**:
```json
{
  "id": 12345,
  "email": "user@example.com",
  "first_name": "John",
  "last_name": "Doe",
  "is_staff": false,
  "is_authenticated": true
}
```

**Error Response (401 Unauthorized)**:
```json
{
  "detail": "Authentication credentials were not provided."
}
```

---

### 1.3 Logout

**Endpoint**: `POST /api/accounts/logout/`

**Description**: Logs out the current user and invalidates the session.

**Authentication**: Required

**Headers**:
```http
X-CSRFToken: [csrf_token]
```

**Response**:
```json
{
  "success": true,
  "message": "Successfully logged out"
}
```

---

## 2. Search Endpoints

### 2.1 Search Suggest (Autocomplete)

**Endpoint**: `GET /api/search_suggest/`

**Description**: Returns autocomplete suggestions for campgrounds and parks.

**Authentication**: Optional (public endpoint)

**Parameters**:
- `q` (string, required): Search query (minimum 2 characters)

**Example Request**:
```http
GET /api/search_suggest/?q=lane
```

**Example Response**:
```json
[
  {
    "id": 34,
    "name": "Lane Poole Reserve",
    "type": "campground",
    "park_id": 12,
    "park_name": "Lane Poole Reserve",
    "region": "Perth Hills",
    "site_count": 45,
    "min_price": 11.00,
    "max_price": 22.00
  },
  {
    "id": 33,
    "name": "Lane Cove",
    "type": "campground",
    "park_id": 11,
    "park_name": "Lane Cove National Park",
    "region": "South West",
    "site_count": 30,
    "min_price": 15.00,
    "max_price": 25.00
  }
]
```

---

### 2.2 Campground Details

**Endpoint**: `GET /api/campground/{campground_id}/`

**Description**: Returns detailed information about a specific campground.

**Authentication**: Optional (public endpoint)

**Path Parameters**:
- `campground_id` (integer, required): ID of the campground

**Example Request**:
```http
GET /api/campground/34/
```

**Example Response**:
```json
{
  "id": 34,
  "name": "Lane Poole Reserve",
  "park": {
    "id": 12,
    "name": "Lane Poole Reserve",
    "region": "Perth Hills"
  },
  "description": "Nestled along the Murray River...",
  "features": ["Toilets", "Picnic tables", "BBQ", "Water"],
  "campfire_allowed": true,
  "dog_allowed": false,
  "max_advance_booking_days": 180,
  "site_types": ["tent", "campervan", "caravan"],
  "price_range": {
    "min": 11.00,
    "max": 22.00
  },
  "check_in_time": "14:00",
  "check_out_time": "10:00",
  "image_url": "https://parkstay.dbca.wa.gov.au/media/campgrounds/lane_poole.jpg",
  "latitude": -32.8509,
  "longitude": 116.0783,
  "contact_phone": "08 9538 1078",
  "rules": [
    "Maximum stay 14 nights during peak season",
    "Maximum 6 people per site",
    "Quiet hours 10pm-7am"
  ]
}
```

---

### 2.3 Park List

**Endpoint**: `GET /api/parks/`

**Description**: Returns list of all parks with campgrounds.

**Authentication**: Optional

**Parameters**:
- `region` (string, optional): Filter by region
- `ordering` (string, optional): Sort order (e.g., "name", "-name")

**Example Response**:
```json
{
  "count": 25,
  "next": null,
  "previous": null,
  "results": [
    {
      "id": 12,
      "name": "Lane Poole Reserve",
      "region": "Perth Hills",
      "campground_count": 3
    }
  ]
}
```

---

## 3. Availability Endpoints

### 3.1 Check Campground Availability

**Endpoint**: `GET /api/campground_availability/{campground_id}/`

**Description**: Checks availability for all sites in a campground for specified dates.

**Authentication**: Required

**Path Parameters**:
- `campground_id` (integer, required): ID of the campground

**Query Parameters**:
- `arrival` (date, required): Arrival date (YYYY-MM-DD)
- `departure` (date, required): Departure date (YYYY-MM-DD)
- `num_adult` (integer, required): Number of adults (1-50)
- `num_child` (integer, optional): Number of children (default: 0)
- `num_infant` (integer, optional): Number of infants (default: 0)
- `gear_type` (string, optional): Site type filter ("tent", "campervan", "caravan", "all")

**Example Request**:
```http
GET /api/campground_availability/34/?arrival=2025-06-15&departure=2025-06-18&num_adult=2&gear_type=tent
```

**Example Response**:
```json
{
  "campground_id": 34,
  "campground_name": "Lane Poole Reserve",
  "arrival": "2025-06-15",
  "departure": "2025-06-18",
  "num_nights": 3,
  "sites": [
    {
      "id": 193,
      "name": "Site A1",
      "type": "tent",
      "max_people": 6,
      "max_vehicles": 2,
      "features": ["Water", "Picnic table"],
      "availability": [
        {
          "date": "2025-06-15",
          "available": true,
          "price": 11.00,
          "reason": null,
          "bookable": true
        },
        {
          "date": "2025-06-16",
          "available": true,
          "price": 11.00,
          "reason": null,
          "bookable": true
        },
        {
          "date": "2025-06-17",
          "available": true,
          "price": 11.00,
          "reason": null,
          "bookable": true
        }
      ],
      "total_price": 33.00,
      "fully_available": true
    },
    {
      "id": 194,
      "name": "Site A2",
      "type": "tent",
      "max_people": 6,
      "max_vehicles": 2,
      "features": ["Water", "Picnic table"],
      "availability": [
        {
          "date": "2025-06-15",
          "available": false,
          "price": 11.00,
          "reason": "Already booked",
          "bookable": false
        },
        {
          "date": "2025-06-16",
          "available": true,
          "price": 11.00,
          "reason": null,
          "bookable": true
        },
        {
          "date": "2025-06-17",
          "available": true,
          "price": 11.00,
          "reason": null,
          "bookable": true
        }
      ],
      "total_price": null,
      "fully_available": false
    }
  ],
  "summary": {
    "total_sites": 45,
    "available_sites": 1,
    "partially_available_sites": 1,
    "unavailable_sites": 43,
    "lowest_price": 33.00
  }
}
```

**Error Responses**:

400 Bad Request - Invalid dates:
```json
{
  "error": "arrival_date_error",
  "message": "Bookings can be made up to 180 days in advance"
}
```

400 Bad Request - Past date:
```json
{
  "error": "date_in_past",
  "message": "Arrival date cannot be in the past"
}
```

---

### 3.2 Check Specific Site Availability

**Endpoint**: `GET /api/campsite_availability/{site_id}/`

**Description**: Checks availability for a specific campsite.

**Authentication**: Required

**Path Parameters**:
- `site_id` (integer, required): ID of the campsite

**Query Parameters**:
- `arrival` (date, required): Arrival date (YYYY-MM-DD)
- `departure` (date, required): Departure date (YYYY-MM-DD)

**Example Request**:
```http
GET /api/campsite_availability/193/?arrival=2025-06-15&departure=2025-06-18
```

**Example Response**:
```json
{
  "id": 193,
  "name": "Site A1",
  "campground": {
    "id": 34,
    "name": "Lane Poole Reserve"
  },
  "type": "tent",
  "max_people": 6,
  "max_vehicles": 2,
  "features": ["Water", "Picnic table", "Fire pit"],
  "description": "Spacious site near the river with shade trees",
  "availability": [
    {
      "date": "2025-06-15",
      "available": true,
      "price": 11.00,
      "reason": null,
      "bookable": true,
      "peak_season": false
    },
    {
      "date": "2025-06-16",
      "available": true,
      "price": 11.00,
      "reason": null,
      "bookable": true,
      "peak_season": false
    },
    {
      "date": "2025-06-17",
      "available": true,
      "price": 11.00,
      "reason": null,
      "bookable": true,
      "peak_season": false
    }
  ],
  "total_price": 33.00,
  "booking_fees": 5.50,
  "grand_total": 38.50,
  "fully_available": true
}
```

---

## 4. Booking Endpoints

### 4.1 Create Booking

**Endpoint**: `POST /api/bookings/`

**Description**: Creates a new booking for a campsite.

**Authentication**: Required

**Headers**:
```http
Content-Type: application/json
X-CSRFToken: [csrf_token]
```

**Request Body**:
```json
{
  "campground_id": 34,
  "campsite_id": 193,
  "arrival": "2025-06-15",
  "departure": "2025-06-18",
  "num_adult": 2,
  "num_child": 0,
  "num_infant": 0,
  "gear_type": "tent",
  "num_vehicle": 1,
  "customer": {
    "first_name": "John",
    "last_name": "Doe",
    "phone": "0400123456",
    "email": "john.doe@example.com"
  },
  "vehicle": {
    "type": "2WD",
    "registration": "1ABC123"
  },
  "special_requirements": "Early check-in if possible",
  "marketing_consent": false
}
```

**Success Response (201 Created)**:
```json
{
  "id": 98765,
  "booking_number": "PS0098765",
  "status": "pending_payment",
  "campground": {
    "id": 34,
    "name": "Lane Poole Reserve"
  },
  "campsite": {
    "id": 193,
    "name": "Site A1"
  },
  "arrival": "2025-06-15",
  "departure": "2025-06-18",
  "num_nights": 3,
  "num_adult": 2,
  "num_child": 0,
  "num_infant": 0,
  "customer": {
    "first_name": "John",
    "last_name": "Doe",
    "email": "john.doe@example.com",
    "phone": "0400123456"
  },
  "costs": {
    "site_fee": 33.00,
    "booking_fee": 5.50,
    "total": 38.50,
    "currency": "AUD"
  },
  "payment": {
    "required": true,
    "due_by": "2025-11-23T10:00:00Z",
    "payment_url": "https://parkstay.dbca.wa.gov.au/payment/98765/"
  },
  "created_at": "2025-11-22T12:34:56Z",
  "confirmation_sent": true
}
```

**Error Responses**:

400 Bad Request - Site unavailable:
```json
{
  "error": "site_unavailable",
  "message": "Site is no longer available for selected dates",
  "unavailable_dates": ["2025-06-15"]
}
```

400 Bad Request - Exceeds max stay:
```json
{
  "error": "max_stay_exceeded",
  "message": "Maximum stay is 14 nights during peak season",
  "max_nights": 14,
  "requested_nights": 15
}
```

409 Conflict - Race condition:
```json
{
  "error": "booking_conflict",
  "message": "Site was booked by another user while you were completing your booking"
}
```

---

### 4.2 Get Booking Details

**Endpoint**: `GET /api/bookings/{booking_number}/`

**Description**: Retrieves details of a specific booking.

**Authentication**: Required (must be booking owner or staff)

**Path Parameters**:
- `booking_number` (string, required): Booking reference number (e.g., "PS0098765")

**Example Request**:
```http
GET /api/bookings/PS0098765/
```

**Example Response**:
```json
{
  "id": 98765,
  "booking_number": "PS0098765",
  "status": "confirmed",
  "campground": {
    "id": 34,
    "name": "Lane Poole Reserve",
    "park": "Lane Poole Reserve",
    "contact_phone": "08 9538 1078"
  },
  "campsite": {
    "id": 193,
    "name": "Site A1",
    "type": "tent"
  },
  "arrival": "2025-06-15",
  "departure": "2025-06-18",
  "check_in_time": "14:00",
  "check_out_time": "10:00",
  "num_nights": 3,
  "num_adult": 2,
  "num_child": 0,
  "num_infant": 0,
  "gear_type": "tent",
  "vehicle": {
    "type": "2WD",
    "registration": "1ABC123"
  },
  "customer": {
    "first_name": "John",
    "last_name": "Doe",
    "email": "john.doe@example.com",
    "phone": "0400123456"
  },
  "costs": {
    "site_fee": 33.00,
    "booking_fee": 5.50,
    "total": 38.50,
    "paid": 38.50,
    "currency": "AUD"
  },
  "payment": {
    "status": "paid",
    "method": "bpoint",
    "paid_at": "2025-11-22T12:40:00Z",
    "transaction_id": "TXN123456789"
  },
  "created_at": "2025-11-22T12:34:56Z",
  "modified_at": "2025-11-22T12:40:00Z",
  "cancellation_policy": {
    "can_cancel": true,
    "refund_percentage": 100,
    "deadline": "2025-06-08T00:00:00Z",
    "terms": "Full refund if cancelled 7+ days before arrival"
  },
  "can_modify": true,
  "special_requirements": "Early check-in if possible",
  "confirmation_pdf_url": "https://parkstay.dbca.wa.gov.au/api/bookings/PS0098765/confirmation.pdf"
}
```

**Status Values**:
- `pending_payment` - Booking created, awaiting payment
- `confirmed` - Paid and confirmed
- `cancelled` - Cancelled by user
- `expired` - Payment not received in time
- `completed` - Stay completed
- `no_show` - Customer did not arrive

---

### 4.3 Get My Bookings

**Endpoint**: `GET /api/bookings/`

**Description**: Returns all bookings for the authenticated user.

**Authentication**: Required

**Query Parameters**:
- `status` (string, optional): Filter by status (confirmed, cancelled, completed, etc.)
- `arrival_from` (date, optional): Filter bookings arriving from this date
- `arrival_to` (date, optional): Filter bookings arriving until this date
- `ordering` (string, optional): Sort order (e.g., "arrival", "-arrival")

**Example Request**:
```http
GET /api/bookings/?status=confirmed&ordering=-arrival
```

**Example Response**:
```json
{
  "count": 3,
  "next": null,
  "previous": null,
  "results": [
    {
      "id": 98765,
      "booking_number": "PS0098765",
      "status": "confirmed",
      "campground_name": "Lane Poole Reserve",
      "campsite_name": "Site A1",
      "arrival": "2025-06-15",
      "departure": "2025-06-18",
      "num_nights": 3,
      "total_cost": 38.50,
      "created_at": "2025-11-22T12:34:56Z"
    }
  ]
}
```

---

### 4.4 Update Booking (Rebook)

**Endpoint**: `PUT /api/bookings/{booking_number}/`

**Description**: Updates an existing booking (change dates, site, etc.).

**Authentication**: Required (must be booking owner)

**Headers**:
```http
Content-Type: application/json
X-CSRFToken: [csrf_token]
```

**Path Parameters**:
- `booking_number` (string, required): Booking reference number

**Request Body** (partial update allowed):
```json
{
  "arrival": "2025-06-16",
  "departure": "2025-06-19",
  "num_adult": 3,
  "special_requirements": "Updated requirements"
}
```

**Success Response (200 OK)**:
```json
{
  "success": true,
  "booking_number": "PS0098765",
  "message": "Booking updated successfully",
  "price_difference": 11.00,
  "payment_required": true,
  "payment_url": "https://parkstay.dbca.wa.gov.au/payment/98765/"
}
```

**Notes**:
- May incur additional charges or provide refunds
- Must follow same booking rules (max stay, availability, etc.)
- Some fields cannot be changed (e.g., booking_number)

---

### 4.5 Cancel Booking

**Endpoint**: `POST /api/bookings/{booking_number}/cancel/`

**Description**: Cancels an existing booking.

**Authentication**: Required (must be booking owner)

**Headers**:
```http
Content-Type: application/json
X-CSRFToken: [csrf_token]
```

**Path Parameters**:
- `booking_number` (string, required): Booking reference number

**Request Body** (optional):
```json
{
  "reason": "Plans changed"
}
```

**Success Response (200 OK)**:
```json
{
  "success": true,
  "booking_number": "PS0098765",
  "status": "cancelled",
  "refund": {
    "amount": 38.50,
    "percentage": 100,
    "method": "original_payment_method",
    "processing_days": "5-7 business days"
  },
  "cancelled_at": "2025-11-22T14:00:00Z"
}
```

**Error Response (400 Bad Request)**:
```json
{
  "error": "cancellation_deadline_passed",
  "message": "Cancellation deadline has passed. No refund available.",
  "deadline": "2025-06-08T00:00:00Z"
}
```

---

### 4.6 Get Booking Confirmation PDF

**Endpoint**: `GET /api/bookings/{booking_number}/confirmation.pdf`

**Description**: Downloads booking confirmation as PDF.

**Authentication**: Required (must be booking owner)

**Path Parameters**:
- `booking_number` (string, required): Booking reference number

**Response**: PDF file (application/pdf)

---

## 5. Queue System Endpoints

### 5.1 Check Queue Status

**Endpoint**: `GET /api/queue/status/`

**Description**: Checks if queue system is active and gets user's position.

**Authentication**: Optional (but creates queue session)

**Example Response (Queue Active)**:
```json
{
  "active": true,
  "position": 42,
  "estimated_wait_seconds": 180,
  "session_id": "abc123def456",
  "polling_interval": 10,
  "message": "High traffic detected. You are in queue."
}
```

**Example Response (Queue Inactive)**:
```json
{
  "active": false,
  "message": "No queue active. Proceed normally."
}
```

**Notes**:
- Sets `sitequeuesession` cookie when queue is active
- Client should poll this endpoint at `polling_interval` seconds
- When `position` reaches 0, user can proceed

---

### 5.2 Exit Queue

**Endpoint**: `POST /api/queue/exit/`

**Description**: Voluntarily exits the queue.

**Authentication**: Required (queue session)

**Headers**:
```http
X-CSRFToken: [csrf_token]
```

**Response**:
```json
{
  "success": true,
  "message": "Exited queue successfully"
}
```

---

## 6. Account Endpoints

### 6.1 Get User Profile

**Endpoint**: `GET /api/account/profile/`

**Description**: Gets the authenticated user's profile.

**Authentication**: Required

**Example Response**:
```json
{
  "id": 12345,
  "email": "john.doe@example.com",
  "first_name": "John",
  "last_name": "Doe",
  "phone": "0400123456",
  "address": {
    "line1": "123 Main St",
    "line2": "",
    "suburb": "Perth",
    "state": "WA",
    "postcode": "6000",
    "country": "Australia"
  },
  "preferences": {
    "marketing_consent": false,
    "sms_notifications": true,
    "email_notifications": true
  },
  "booking_history_count": 5,
  "member_since": "2020-03-15T00:00:00Z"
}
```

---

### 6.2 Update User Profile

**Endpoint**: `PATCH /api/account/profile/`

**Description**: Updates user profile information.

**Authentication**: Required

**Headers**:
```http
Content-Type: application/json
X-CSRFToken: [csrf_token]
```

**Request Body** (partial update):
```json
{
  "phone": "0400999888",
  "preferences": {
    "sms_notifications": false
  }
}
```

**Response**: Returns updated profile (same as GET profile)

---

## 7. Payment Endpoints

### 7.1 Initiate Payment

**Endpoint**: `POST /api/payments/initiate/`

**Description**: Initiates payment process for a booking.

**Authentication**: Required

**Headers**:
```http
Content-Type: application/json
X-CSRFToken: [csrf_token]
```

**Request Body**:
```json
{
  "booking_id": 98765,
  "payment_method": "bpoint"
}
```

**Response**:
```json
{
  "payment_session_id": "pay_abc123",
  "redirect_url": "https://www.bpoint.com.au/payments/...",
  "amount": 38.50,
  "currency": "AUD",
  "expires_at": "2025-11-22T13:00:00Z"
}
```

**Notes**:
- Client should redirect user to `redirect_url`
- User completes payment on BPOINT gateway
- Gateway redirects back to ParkStay callback URL

---

### 7.2 Payment Callback (Internal)

**Endpoint**: `POST /api/payments/callback/`

**Description**: Handles payment gateway callback (called by BPOINT).

**Authentication**: Gateway signature validation

**Notes**:
- Not called directly by clients
- Validates payment with gateway
- Updates booking status
- Sends confirmation email

---

## 8. Information Endpoints

### 8.1 Get Regions

**Endpoint**: `GET /api/regions/`

**Description**: Returns list of all regions.

**Authentication**: Optional

**Example Response**:
```json
[
  {
    "id": 1,
    "name": "Perth Hills",
    "campground_count": 5
  },
  {
    "id": 2,
    "name": "South West",
    "campground_count": 12
  }
]
```

---

### 8.2 Get Site Types

**Endpoint**: `GET /api/site-types/`

**Description**: Returns available site types.

**Authentication**: Optional

**Example Response**:
```json
[
  {
    "code": "tent",
    "name": "Tent",
    "description": "Sites suitable for tents"
  },
  {
    "code": "campervan",
    "name": "Campervan",
    "description": "Sites with vehicle access for campervans"
  },
  {
    "code": "caravan",
    "name": "Caravan",
    "description": "Sites suitable for caravans and larger vehicles"
  }
]
```

---

## Error Handling

### Standard Error Response Format

All errors follow this structure:

```json
{
  "error": "error_code",
  "message": "Human-readable error message",
  "details": {
    "field_name": ["Error details for specific fields"]
  },
  "timestamp": "2025-11-22T12:00:00Z"
}
```

### HTTP Status Codes

- `200 OK` - Successful GET/PUT/PATCH
- `201 Created` - Successful POST (resource created)
- `204 No Content` - Successful DELETE
- `400 Bad Request` - Invalid input data
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - Authenticated but not authorized
- `404 Not Found` - Resource doesn't exist
- `409 Conflict` - Conflict (e.g., race condition)
- `429 Too Many Requests` - Rate limit exceeded
- `500 Internal Server Error` - Server error
- `503 Service Unavailable` - Maintenance or overload

### Common Error Codes

- `authentication_required` - Must be logged in
- `invalid_session` - Session expired or invalid
- `csrf_token_invalid` - CSRF validation failed
- `permission_denied` - Not authorized for this action
- `resource_not_found` - Requested resource doesn't exist
- `validation_error` - Input validation failed
- `rate_limit_exceeded` - Too many requests
- `booking_conflict` - Race condition (site booked by another user)
- `site_unavailable` - Site not available for dates
- `max_stay_exceeded` - Exceeds maximum stay limit
- `booking_window_exceeded` - Attempting to book too far in advance
- `date_in_past` - Date is in the past
- `payment_failed` - Payment processing failed
- `payment_required` - Payment needed before proceeding
- `cancellation_deadline_passed` - Too late to cancel

---

## Rate Limiting

### Limits

- **Authenticated**: 60 requests per minute
- **Unauthenticated**: 30 requests per minute
- **Burst**: 10 requests

### Rate Limit Headers

```http
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1637581200
```

### Rate Limit Error Response

```json
{
  "error": "rate_limit_exceeded",
  "message": "Too many requests. Please try again later.",
  "retry_after": 60,
  "limit": 60,
  "window": "1 minute"
}
```

---

## Testing Recommendations

### 1. Manual Testing with Browser DevTools

1. Open browser DevTools (Network tab)
2. Log in through normal web flow
3. Navigate to "My Bookings" or search page
4. Observe API calls in Network tab
5. Export session cookies
6. Copy request headers and payloads

### 2. Session Cookie Export

Use browser console:
```javascript
// Export cookies
document.cookie.split(';').map(c => c.trim()).forEach(c => console.log(c));

// Or use DevTools > Application > Cookies
```

### 3. Testing with Postman/Insomnia

1. Import session cookies
2. Set headers:
   - `Cookie: sessionid=xxx; csrftoken=yyy`
   - `X-CSRFToken: yyy`
   - `User-Agent: Mozilla/5.0 ...`
3. Test endpoints in sequence
4. Document actual responses

### 4. Automated Testing Considerations

**Challenges**:
- Magic link authentication cannot be automated easily
- Sessions expire after 24 hours
- CSRF tokens must be extracted and included
- Queue system may activate during high traffic
- Rate limiting applies

**Recommended Approach**:
- Use manually-obtained session cookies for testing
- Refresh session cookies daily
- Monitor for 401 responses (session expired)
- Handle queue system gracefully
- Respect rate limits (max 30 req/min during testing)

---

## Pagination

Endpoints returning lists use cursor pagination:

**Request**:
```http
GET /api/bookings/?limit=20&offset=0
```

**Response**:
```json
{
  "count": 150,
  "next": "/api/bookings/?limit=20&offset=20",
  "previous": null,
  "results": [...]
}
```

**Parameters**:
- `limit` (integer): Items per page (default: 20, max: 100)
- `offset` (integer): Number of items to skip (default: 0)

---

## Versioning

Current API version: **v1** (implicit, no version in URL)

Future versions may use URL versioning:
- `/api/v2/...`

Breaking changes will be versioned. Non-breaking changes may be added to current version.

---

## Known Limitations & Uncertainties

### Confirmed
- Azure AD B2C with magic link authentication
- Django backend with session-based auth
- 180-day advance booking window
- Queue system during high traffic
- BPOINT payment gateway

### Requires Testing
- Exact endpoint URLs (educated guesses based on Django REST conventions)
- Complete request/response schemas
- All validation rules and business logic
- Exact error messages and codes
- Rate limiting specifics
- Queue system integration details
- Payment flow details

### Missing Information
- Webhook endpoints (if any)
- Admin/staff endpoints
- Reporting endpoints
- Batch operations (if supported)
- WebSocket/real-time updates (if any)

---

## Next Steps

1. **Manual Browser Testing**
   - Log in through web interface
   - Use DevTools to capture actual API calls
   - Document exact request/response formats
   - Export session cookies

2. **API Testing**
   - Test with exported cookies
   - Verify endpoint URLs
   - Document actual responses
   - Test error scenarios

3. **Update Documentation**
   - Correct any inaccuracies
   - Add missing endpoints discovered
   - Update request/response examples
   - Document edge cases

4. **Implementation**
   - Update `parkstay.service.ts` with confirmed endpoints
   - Implement error handling
   - Add session management
   - Test thoroughly before production use

---

## Related Documentation

- [Authentication Flow](./AUTHENTICATION_FLOW.md) - Detailed authentication flow
- [GitHub Repository](https://github.com/dbca-wa/parkstay_bs_v2) - Source code (if accessible)
- [Azure AD B2C Docs](https://learn.microsoft.com/en-us/azure/active-directory-b2c/)
