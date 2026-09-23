import { Test, TestingModule } from '@nestjs/testing';
import { AiContentModule } from '../src/ai-content/ai-content.module.js';
import { AiContentService } from '../src/ai-content/ai-content.service.js';

// Smoke test contra la API real de Anthropic — solo corre si hay una
// ANTHROPIC_API_KEY configurada (no en CI). Sirve para revisar a mano que
// las preguntas generadas tengan sentido, no reemplaza a las unitarias.
describe.skipIf(!process.env.ANTHROPIC_API_KEY)('AiContentService + Claude (e2e)', () => {
  let service: AiContentService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AiContentModule],
    }).compile();
    service = moduleFixture.get(AiContentService);
  });

  it('genera 5 preguntas de historia con la IA real', async () => {
    const questions = await service.getTriviaQuestions('historia', 5);

    expect(questions).toHaveLength(5);
    for (const q of questions) {
      expect(q.opciones).toHaveLength(4);
      expect(q.opciones[q.indiceCorrecto]).toBeTruthy();
      // eslint-disable-next-line no-console
      console.log(`- ${q.pregunta} → ${q.opciones[q.indiceCorrecto]}`);
    }
  }, 30_000);
});
