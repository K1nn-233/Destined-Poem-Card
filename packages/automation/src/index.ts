import { start } from './runtime/start';
import { errorCatched } from './utils';

$(() => {
  errorCatched(start)();
});
