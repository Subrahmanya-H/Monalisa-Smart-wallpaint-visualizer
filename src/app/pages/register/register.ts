import { HttpErrorResponse } from '@angular/common/http';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  imports: [FormsModule, RouterLink],
  selector: 'app-register',
  styleUrl: './register.scss',
  templateUrl: './register.html',
  standalone: true,
})
export class Register {
  readonly isAdminRegistration: boolean;
  name = '';
  email = '';
  password = '';
  adminKey = '';
  errorMessage = '';
  isSubmitting = false;

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router,
    route: ActivatedRoute
  ) {
    this.isAdminRegistration = route.snapshot.url.some((segment) => segment.path === 'admin-register');
  }

  submit(): void {
    this.errorMessage = '';
    this.isSubmitting = true;
    const request = this.isAdminRegistration
      ? this.auth.registerAdmin(this.name, this.email, this.password, this.adminKey)
      : this.auth.register(this.name, this.email, this.password);

    request.subscribe({
      next: (user) => {
        this.isSubmitting = false;
        void this.router.navigateByUrl(user.role === 'admin' ? '/admin' : '/');
      },
      error: (error: HttpErrorResponse) => {
        this.isSubmitting = false;
        this.errorMessage = error.status === 0
          ? 'Cannot reach the API. Make sure the Express server is running, then try again.'
          : error.error?.message ?? 'Could not create the account. Please try again.';
      }
    });
  }
}
