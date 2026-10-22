import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, signal } from '@angular/core';
import { Observable, catchError, map, of, tap, throwError } from 'rxjs';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: 'customer' | 'admin';
}

interface AuthResponse {
  user: AuthUser;
}

interface UserResponse {
  user: AuthUser;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly currentUser = signal<AuthUser | null>(null);

  constructor(private readonly http: HttpClient) {}

  register(name: string, email: string, password: string): Observable<AuthUser> {
    return this.http.post<AuthResponse>('/api/auth/register', { name, email, password })
      .pipe(map(({ user }) => this.setUser(user)));
  }

  registerAdmin(name: string, email: string, password: string, adminKey: string): Observable<AuthUser> {
    return this.http.post<AuthResponse>('/api/auth/admin-register', {
      name,
      email,
      password,
      adminKey
    }).pipe(map(({ user }) => this.setUser(user)));
  }

  login(email: string, password: string): Observable<AuthUser> {
    return this.http.post<AuthResponse>('/api/auth/login', { email, password })
      .pipe(map(({ user }) => this.setUser(user)));
  }

  getCurrentUser(): Observable<AuthUser | null> {
    return this.http.get<UserResponse>('/api/auth/me').pipe(
      map(({ user }) => this.setUser(user)),
      catchError((error: HttpErrorResponse) => {
        if (error.status === 401) {
          this.currentUser.set(null);
          return of(null);
        }
        return throwError(() => error);
      })
    );
  }

  logout(): Observable<void> {
    return this.http.post<void>('/api/auth/logout', {}).pipe(
      tap(() => this.currentUser.set(null))
    );
  }

  uploadRoomImage(file: File): Observable<{ url: string; publicId: string }> {
    const formData = new FormData();
    formData.append('image', file);
    return this.http.post<{ url: string; publicId: string }>('/api/uploads/image', formData);
  }

  private setUser(user: AuthUser): AuthUser {
    this.currentUser.set(user);
    return user;
  }
}
