import { HttpErrorResponse } from '@angular/common/http';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  imports: [FormsModule, RouterLink],
  selector: 'app-login',
  styleUrl: './login.scss',
  templateUrl: './login.html',
  standalone: true,
})
export class Login {
  email = '';
  password = '';
  errorMessage = '';
  isSubmitting = false;

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router
  ) {}

  submit(): void {
    this.errorMessage = '';
    this.isSubmitting = true;
    this.auth.login(this.email, this.password).subscribe({
      next: (user) => {
        this.isSubmitting = false;
        void this.router.navigateByUrl(user.role === 'admin' ? '/admin' : '/');
      },
      error: (error: HttpErrorResponse) => {
        this.isSubmitting = false;
        this.errorMessage = error.status === 0
          ? 'Cannot reach the API. Make sure the Express server is running, then try again.'
          : error.error?.message ?? 'Could not sign in. Please try again.';
      }
    });
  }
}
