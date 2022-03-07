import { TestBed } from '@angular/core/testing';

import { GetCoverageService } from './get-coverage.service';

describe('GetCoverageService', () => {
  let service: GetCoverageService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(GetCoverageService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
