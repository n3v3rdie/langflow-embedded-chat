// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';
import { TextDecoder, TextEncoder } from "util";

// jsdom used by react-scripts 5 does not expose the encoding APIs.
Object.assign(global, { TextDecoder, TextEncoder });
