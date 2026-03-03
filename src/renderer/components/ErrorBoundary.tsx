import React, { Component, ReactNode, ErrorInfo } from "react";

import { logger } from "../utils/logger";

interface Props {
  children: ReactNode;
  onFatalError: (errorDetails: string) => void;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log the error to our internal logger
    logger.error(
      "[ErrorBoundary] React Rendering Error caught:",
      error,
      errorInfo,
    );

    // Format error details to pass to the global fatal error handler
    const errorMessage = error.stack || error.message || String(error);
    const componentStack = errorInfo.componentStack || "";
    const errorDetails = `[React Rendering Error] ${errorMessage}\n\nComponent Stack:\n${componentStack}`;

    this.props.onFatalError(errorDetails);
  }

  render() {
    if (this.state.hasError) {
      // Return null because App.tsx will handle showing the FatalErrorModal
      // based on the fatalError state that gets set via onFatalError
      return null;
    }

    return this.props.children;
  }
}
