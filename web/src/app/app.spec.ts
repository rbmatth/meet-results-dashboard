import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    // DivisionService loads the meet index unconditionally (not just via the root-route
    // guard), so the selector has options even when a direct navigation to /<meet>/...
    // never runs that guard. At the root URL there is no meet segment, so no per-meet
    // data (loadMeet) is requested — only the index.
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('data/index.json').flush([]);
    http.verify();
    expect(fixture.componentInstance).toBeTruthy();
  });
});
