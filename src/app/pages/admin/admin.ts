import { DatePipe } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PaintTheme, ThemeInput, ThemeMotif, ThemeService } from '../../core/theme.service';

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: 'customer' | 'admin';
  createdAt: string;
}

interface CustomerProject {
  id: string;
  projectName: string;
  thumbnailUrl: string;
  selectedColor: string;
  polygonCount: number;
  ownerName: string;
  ownerEmail: string;
  updatedAt: string;
}

type DashboardTab = 'users' | 'projects' | 'themes';

const emptyThemeForm = (): ThemeInput => ({
  name: '',
  description: '',
  motif: 'vintage',
  baseColor: '#b28b54',
  accentColor: '#f1dcae',
  imageUrl: '',
  isActive: true,
});

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink],
  templateUrl: './admin.html'
})
export class Admin implements OnInit {
  users: AdminUser[] = [];
  projects: CustomerProject[] = [];
  themes: PaintTheme[] = [];
  readonly motifs: { id: ThemeMotif; name: string }[] = [
    { id: 'solid', name: 'Solid color' },
    { id: 'geometric', name: 'Geometric' },
    { id: 'botanical', name: 'Botanical' },
    { id: 'halloween', name: 'Seasonal / Halloween' },
    { id: 'vintage', name: 'Vintage / ornate' },
    { id: 'graffiti', name: 'Urban mural' },
    { id: 'gallery', name: 'Gallery arches' },
  ];
  activeTab: DashboardTab = 'users';
  themeForm = emptyThemeForm();
  editingThemeId: string | null = null;
  selectedImageFile: File | null = null;
  userSearch = '';
  projectSearch = '';
  isLoading = true;
  isSavingTheme = false;
  isUploadingThemeImage = false;
  errorMessage = '';
  statusMessage = '';

  constructor(
    private readonly http: HttpClient,
    private readonly themeService: ThemeService
  ) {}

  get filteredUsers(): AdminUser[] {
    const query = this.userSearch.trim().toLowerCase();
    if (!query) {
      return this.users;
    }
    return this.users.filter((user) =>
      user.name.toLowerCase().includes(query) ||
      user.email.toLowerCase().includes(query) ||
      user.role.includes(query)
    );
  }

  get filteredProjects(): CustomerProject[] {
    const query = this.projectSearch.trim().toLowerCase();
    if (!query) {
      return this.projects;
    }
    return this.projects.filter((project) =>
      project.projectName.toLowerCase().includes(query) ||
      project.ownerName.toLowerCase().includes(query) ||
      project.ownerEmail.toLowerCase().includes(query)
    );
  }

  activeThemeCount(): number {
    return this.themes.filter((theme) => theme.isActive).length;
  }

  ngOnInit(): void {
    this.loadUsers();
    this.loadProjects();
    this.loadThemes();
  }

  setTab(tab: DashboardTab): void {
    this.activeTab = tab;
    this.errorMessage = '';
    this.statusMessage = '';
  }

  editTheme(theme: PaintTheme): void {
    this.editingThemeId = theme.id;
    this.themeForm = {
      name: theme.name,
      description: theme.description,
      motif: theme.motif,
      baseColor: theme.baseColor,
      accentColor: theme.accentColor,
      imageUrl: theme.imageUrl,
      isActive: theme.isActive,
    };
    this.selectedImageFile = null;
    this.errorMessage = '';
    this.statusMessage = `Editing ${theme.name}.`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  cancelThemeEdit(): void {
    this.editingThemeId = null;
    this.themeForm = emptyThemeForm();
    this.selectedImageFile = null;
    this.statusMessage = '';
  }

  clearThemeForm(): void {
    this.themeForm = emptyThemeForm();
    this.selectedImageFile = null;
  }

  onThemeImageChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.selectedImageFile = input.files?.[0] ?? null;
    this.errorMessage = '';
  }

  uploadThemeImage(): void {
    if (!this.selectedImageFile || this.isUploadingThemeImage) {
      return;
    }
    this.isUploadingThemeImage = true;
    this.errorMessage = '';
    this.themeService.uploadImage(this.selectedImageFile).subscribe({
      next: ({ url }) => {
        this.themeForm.imageUrl = url;
        this.selectedImageFile = null;
        this.isUploadingThemeImage = false;
        this.statusMessage = 'Theme image uploaded. Save the theme to keep this image attached.';
      },
      error: (error: HttpErrorResponse) => {
        this.isUploadingThemeImage = false;
        this.errorMessage = error.error?.message ?? 'Could not upload this theme image.';
      }
    });
  }

  saveTheme(): void {
    if (this.isSavingTheme) {
      return;
    }
    this.isSavingTheme = true;
    this.errorMessage = '';
    this.statusMessage = '';
    const save = this.editingThemeId
      ? this.themeService.update(this.editingThemeId, this.themeForm)
      : this.themeService.create(this.themeForm);

    save.subscribe({
      next: ({ theme }) => {
        this.isSavingTheme = false;
        this.statusMessage = `${theme.name} saved successfully.`;
        this.editingThemeId = null;
        this.themeForm = emptyThemeForm();
        this.selectedImageFile = null;
        this.loadThemes();
      },
      error: (error: HttpErrorResponse) => {
        this.isSavingTheme = false;
        this.errorMessage = error.error?.message ?? 'Could not save the theme.';
      }
    });
  }

  toggleTheme(theme: PaintTheme): void {
    const payload: ThemeInput = {
      name: theme.name,
      description: theme.description,
      motif: theme.motif,
      baseColor: theme.baseColor,
      accentColor: theme.accentColor,
      imageUrl: theme.imageUrl,
      isActive: !theme.isActive,
    };
    this.themeService.update(theme.id, payload).subscribe({
      next: ({ theme: updated }) => {
        this.themes = this.themes.map((item) => item.id === updated.id ? updated : item);
        this.statusMessage = `${updated.name} is now ${updated.isActive ? 'available' : 'hidden'} in the visualizer.`;
      },
      error: (error: HttpErrorResponse) => {
        this.errorMessage = error.error?.message ?? 'Could not update theme availability.';
      }
    });
  }

  deleteTheme(theme: PaintTheme): void {
    if (theme.isBuiltIn) {
      return;
    }
    if (!window.confirm(`Delete the "${theme.name}" theme? This cannot be undone.`)) {
      return;
    }
    this.themeService.delete(theme.id).subscribe({
      next: () => {
        this.themes = this.themes.filter((item) => item.id !== theme.id);
        this.statusMessage = `${theme.name} deleted.`;
      },
      error: (error: HttpErrorResponse) => {
        this.errorMessage = error.error?.message ?? 'Could not delete this theme.';
      }
    });
  }

  deleteProject(project: CustomerProject): void {
    if (!window.confirm(`Delete "${project.projectName}"? This cannot be undone.`)) {
      return;
    }
    this.http.delete<void>(`/api/admin/projects/${encodeURIComponent(project.id)}`).subscribe({
      next: () => {
        this.projects = this.projects.filter((item) => item.id !== project.id);
        this.statusMessage = `"${project.projectName}" was deleted.`;
      },
      error: (error: HttpErrorResponse) => {
        this.errorMessage = error.error?.message ?? 'Could not delete this project.';
      }
    });
  }

  private loadUsers(): void {
    this.http.get<{ users: AdminUser[] }>('/api/admin/users').subscribe({
      next: ({ users }) => {
        this.users = users;
        this.isLoading = false;
      },
      error: (error: HttpErrorResponse) => {
        this.isLoading = false;
        this.errorMessage = error.error?.message ?? 'Could not load the account list.';
      }
    });
  }

  private loadProjects(): void {
    this.http.get<{ projects: CustomerProject[] }>('/api/admin/projects').subscribe({
      next: ({ projects }) => {
        this.projects = projects;
      },
      error: (error: HttpErrorResponse) => {
        this.errorMessage = error.error?.message ?? 'Could not load customer projects.';
      }
    });
  }

  private loadThemes(): void {
    this.themeService.listForAdmin().subscribe({
      next: ({ themes }) => {
        this.themes = themes;
      },
      error: (error: HttpErrorResponse) => {
        this.errorMessage = error.error?.message ?? 'Could not load themes.';
      }
    });
  }
}
