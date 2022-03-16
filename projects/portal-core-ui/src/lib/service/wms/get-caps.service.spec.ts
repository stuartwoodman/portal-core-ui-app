import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { GetCapsService } from './get-caps.service';

describe('GetCapsService', () => {

  beforeEach(() => TestBed.configureTestingModule({
    imports: [HttpClientTestingModule], 
    providers: [GetCapsService]
  }));

  it('should be created', () => {
    const service: GetCapsService = TestBed.inject(GetCapsService);
    expect(service).toBeTruthy();
   });
});
