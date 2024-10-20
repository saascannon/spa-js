import * as oauth2 from "oauth4webapi";
import AccountManager from "./accountManager";
import EventEmitter from "./eventEmitter";
import ShopManager from "./shopManager";
export type User = {
  id: string;
  name: string;
  user_billable_id?: string | null;
  [key: string]: unknown;
};

type AfterCallbackHandler = () => void;
type OAuthErrorHandler = (error: oauth2.OAuth2Error) => void;

type OptionalKeys<T> = {
  [K in keyof T]-?: {} extends Pick<T, K> ? K : never;
}[keyof T];

type ExtractOptional<T> = Required<Pick<T, OptionalKeys<T>>>;

export type Options = {
  domain: string;
  clientId: string;
  redirectUri: string;
  afterCallback?: AfterCallbackHandler;
  oAuthErrorHandler?: OAuthErrorHandler;
  uiBaseUrl?: string;
};

interface IsaascannonSpaSdk {
  getAccessToken(): Promise<string | null>;
  loginViaRedirect(): Promise<void>;
  signupViaRedirect(): Promise<void>;
  logoutViaRedirect(redirectAfterLoginUrl?: string): void;
  hasPermissions(requiredPermissions: string | string[] | string[][]): boolean;
  accountManagement: AccountManager;
  shopManagement: ShopManager;
  loadAuthState(): Promise<void>;
}

export default class SaascannonSpaSdk
  extends EventEmitter<"auth-state-loaded" | "new-access-token">
  implements IsaascannonSpaSdk
{
  private readonly codeVerifierKey = "_sc_code_verifier";
  private readonly refreshTokenKey = "_sc_rt";
  private readonly options: Required<Options>;
  private idToken: string | undefined;
  public user: User | undefined;
  private _accessToken: string | null = null;
  private accessTokenExpiary: Date | undefined;
  private authServer: oauth2.AuthorizationServer | undefined = undefined;
  private client: oauth2.Client;
  public accountManagement: AccountManager;
  public shopManagement: ShopManager;

  private get accessToken(): string | null {
    return this._accessToken;
  }

  private set accessToken(value: string | null) {
    this.triggerEvent("new-access-token", value);
    this._accessToken = value;
  }

  private get refreshToken(): string | null {
    return localStorage.getItem(this.refreshTokenKey);
  }

  private set refreshToken(value: string | null) {
    if (value === null) {
      localStorage.removeItem(this.refreshTokenKey);
    } else {
      localStorage.setItem(this.refreshTokenKey, value);
    }
  }

  private get codeVerifier(): string | null {
    return localStorage.getItem(this.codeVerifierKey);
  }

  private set codeVerifier(value: string | null) {
    if (value === null) {
      localStorage.removeItem(this.codeVerifierKey);
    } else {
      localStorage.setItem(this.codeVerifierKey, value);
    }
  }

  constructor(options: Options) {
    super();

    if (typeof window === "undefined") {
      throw new Error(
        "window context not found, ensure that this constructor is only called in the browser.",
      );
    }

    if (typeof document === "undefined") {
      throw new Error(
        "document context not found, ensure that this constructor is only called in the browser.",
      );
    }

    const defaults: ExtractOptional<Options> = {
      afterCallback: () => (window.location.href = "/"),
      oAuthErrorHandler: (e: oauth2.OAuth2Error) => {
        alert(`${e.error}: ${e.error_description}`);
      },
      uiBaseUrl: "https://ui.saascannon.com",
    };

    this.options = Object.assign(defaults, options);

    this.client = {
      client_id: this.options.clientId,
      token_endpoint_auth_method: "none",
    };

    this.accountManagement = new AccountManager(
      this.options.uiBaseUrl,
      this.options.domain,
      this,
      this.options.domain,
    ).on("account-updated", async () => await this.loadAuthState());

    this.shopManagement = new ShopManager(
      this.options.uiBaseUrl,
      this.options.domain,
      this,
      this.options.domain,
    );
  }

  private async initAuthServer(): Promise<void> {
    const issuer = new URL(this.options.domain);

    try {
      const discoveryResponse = await oauth2.discoveryRequest(issuer);

      this.authServer = await oauth2.processDiscoveryResponse(
        issuer,
        discoveryResponse,
      );
    } catch (e) {
      console.error("Could not discover OIDC server", e);
      return;
    }

    if (!this.authServer.code_challenge_methods_supported?.includes("S256")) {
      throw new Error("PKCE S256 not supported");
    }
  }

  private processTokenResult(
    result:
      | oauth2.OAuth2Error
      | oauth2.TokenEndpointResponse
      | oauth2.OpenIDTokenEndpointResponse,
  ) {
    if (oauth2.isOAuth2Error(result)) {
      if (result.error === "invalid_grant") {
        this.refreshToken = null;
      }
      this.options.oAuthErrorHandler(result);
      return;
    }

    this.idToken = result.id_token;
    this.accessToken = result.access_token;

    if (result.expires_in) {
      this.accessTokenExpiary = new Date(Date.now() + result.expires_in * 1000);
    }

    if (result.refresh_token) {
      this.refreshToken = result.refresh_token;
    }

    const claims = oauth2.getValidatedIdTokenClaims(result);

    if (claims) {
      if (!claims.name) {
        throw new Error("'name' missing from claims");
      }

      this.user = {
        ...claims,
        id: claims.sub,
        name: claims.name.toString(),
      };
    }
  }

  private async completeOAuth2Flow() {
    const currentUrl = new URL(window.location.href);

    if (!this.authServer) {
      await this.initAuthServer();
    }

    if (!this.authServer) {
      throw new Error("Could not identify auth server config");
    }

    const params = oauth2.validateAuthResponse(
      this.authServer,
      this.client,
      currentUrl,
      oauth2.expectNoState,
    );

    if (oauth2.isOAuth2Error(params)) {
      return this.options.oAuthErrorHandler(params);
    }

    if (!this.codeVerifier) {
      return;
    }

    const response = await oauth2.authorizationCodeGrantRequest(
      this.authServer,
      this.client,
      params,
      this.options.redirectUri,
      this.codeVerifier,
    );

    this.codeVerifier = null;

    const challenges = oauth2.parseWwwAuthenticateChallenges(response);

    if (challenges) {
      for (const challenge of challenges) {
        console.warn("Challenge", challenge);
      }
      throw new Error("Authentication challenges recieved");
    }

    const result = await oauth2.processAuthorizationCodeOpenIDResponse(
      this.authServer,
      this.client,
      response,
    );

    this.processTokenResult(result);

    this.options.afterCallback();
  }

  private async refreshAccessToken() {
    if (!this.authServer) {
      await this.initAuthServer();
    }

    if (!this.authServer) {
      throw new Error("Could not identify auth server config");
    }

    if (!this.refreshToken) {
      throw new Error("No refresh token saved");
    }

    const response = await oauth2.refreshTokenGrantRequest(
      this.authServer,
      this.client,
      this.refreshToken,
    );

    const result = await oauth2.processRefreshTokenResponse(
      this.authServer,
      this.client,
      response,
    );

    this.processTokenResult(result);
  }

  public async loadAuthState(): Promise<void> {
    if (typeof window === "undefined") {
      throw new Error(
        "window context not found, ensure that this method is only called in the browser.",
      );
    }

    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get("code");
    const error = urlParams.get("error");

    if (
      window.location.href.startsWith(this.options.redirectUri) &&
      (code || error)
    ) {
      await this.completeOAuth2Flow();
    } else if (this.refreshToken) {
      try {
        await this.refreshAccessToken();
      } catch (error) {
        console.error(error);
      }
    }
    this.triggerEvent("auth-state-loaded");
  }

  private getAccessTokenPayload() {
    if (!this.accessToken) throw new Error("User not logged in");

    return JSON.parse(
      Buffer.from(this.accessToken.split(".")[1], "base64").toString(),
    );
  }

  /**
   * Retrieve the access token for the current user which can be used to ake requests on their behalf
   * @returns access token
   */
  public async getAccessToken(): Promise<string | null> {
    if (!this.accessToken || !this.accessTokenExpiary) {
      return null;
    }

    if (this.accessTokenExpiary < new Date()) {
      try {
        await this.refreshAccessToken();
      } catch (e) {
        throw new Error("Access token has expired and could not be refreshed");
      }
    }

    return this.accessToken;
  }

  private async generateAuthorizationUrl(
    authorizationInitialAction: "login" | "signup",
  ): Promise<string> {
    if (!this.authServer) {
      await this.initAuthServer();
    }

    if (!this.authServer) {
      throw new Error("Could not identify auth server config");
    }

    this.codeVerifier = oauth2.generateRandomCodeVerifier();
    const codeChallenge = await oauth2.calculatePKCECodeChallenge(
      this.codeVerifier,
    );
    const codeChallengeMethod = "S256";

    const authEndpoint = this.authServer.authorization_endpoint;

    if (!authEndpoint) {
      throw new Error(
        "Auth server has not specified an authorization endpoint",
      );
    }

    const searchParams = new URLSearchParams({
      client_id: this.client.client_id,
      code_challenge: codeChallenge,
      code_challenge_method: codeChallengeMethod,
      redirect_uri: this.options.redirectUri,
      response_type: "code",
      scope: "openid profile email amr auth_time shop",
      authorization_initial_action: authorizationInitialAction,
    });

    return `${authEndpoint}?${searchParams.toString()}`;
  }

  /**
   * Redirect the user to the login page
   */
  public async loginViaRedirect(): Promise<void> {
    console.log(this);
    const authUrl = await this.generateAuthorizationUrl("login");

    window.location.href = authUrl;
  }

  /**
   * Redirect the user to the signup page
   */
  public async signupViaRedirect(): Promise<void> {
    const authUrl = await this.generateAuthorizationUrl("signup");

    window.location.href = authUrl;
  }

  /**
   * Redirect the user to the logout page
   */
  public logoutViaRedirect(redirectAfterLoginUrl?: string): void {
    if (!this.authServer) {
      throw new Error("Could not identify auth server config");
    }

    const endSessionUrl = this.authServer.end_session_endpoint;

    if (!endSessionUrl || !this.idToken) {
      return;
    }

    const searchParams = new URLSearchParams({ id_token_hint: this.idToken });

    if (redirectAfterLoginUrl) {
      searchParams.set("post_logout_redirect_uri", redirectAfterLoginUrl);
    }

    this.refreshToken = null;

    const logoutUrl = `${endSessionUrl}?${searchParams.toString()}`;

    window.location.href = logoutUrl;
  }

  /**
   * Check if the user has the required permissions
   * @param requiredPermissions The required permissions
   * @returns boolean indicating if the user has the required permissions
   */
  public hasPermissions(requiredPermissions: string | string[] | string[][]) {
    // Convert all input types to string[][]
    const required: string[][] =
      typeof requiredPermissions === "string"
        ? ([[requiredPermissions]] as string[][])
        : Array.isArray(requiredPermissions) &&
            (requiredPermissions as unknown[]).every(
              (rp: unknown) => typeof rp === "string",
            )
          ? ([requiredPermissions] as string[][])
          : (requiredPermissions as string[][]);

    const permissions: string[] = this.getAccessTokenPayload().permissions;

    return required.some((requiredTogether: string[]) =>
      requiredTogether.every((perm) => permissions.includes(perm)),
    );
  }
}
