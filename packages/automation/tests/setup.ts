import _ from 'lodash';
import * as z from 'zod';

Object.assign(globalThis, {
  _,
  z,
  injectPrompts: jest.fn(),
  uninjectPrompts: jest.fn(),
  insertOrAssignVariables: jest.fn(),
});
