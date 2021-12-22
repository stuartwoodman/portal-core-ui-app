import { TestBed } from '@angular/core/testing';

import { GetCapsService } from './get-caps.service';

describe('GetCapsService', () => {
  let service: GetCapsService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(GetCapsService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
