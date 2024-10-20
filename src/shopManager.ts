import Modal from "./modal";
import SaascannonSpaSdk from ".";
import {
  ApiError as AccountManagementApiError,
  SaascannonAccountManagement,
} from "@saascannon/account-management-js";

class ShopManager {
  // Shop Modals Keyed by billabeId
  private shopModals: Map<string, Modal> = new Map();
  public api: SaascannonAccountManagement;
  private sdk: SaascannonSpaSdk;
  private applicationBaseDomain: string;
  private uiBaseUrl: string;

  constructor(
    uiBaseUrl: string,
    applicationBaseDomain: string,
    sdk: SaascannonSpaSdk,
    tenantDomain: string,
  ) {
    this.api = new SaascannonAccountManagement({
      BASE: `${tenantDomain}/accounts-api`,
      VERSION: "2.0",
      WITH_CREDENTIALS: false,
      CREDENTIALS: "omit",
      TOKEN: async () => {
        const accessToken = await sdk.getAccessToken();
        if (!accessToken) {
          throw new Error("User not logged in");
        }
        return accessToken;
      },
    });

    this.sdk = sdk;
    this.applicationBaseDomain = applicationBaseDomain;
    this.uiBaseUrl = uiBaseUrl;
  }

  private createIFrame(uiPageFullUrl: URL): HTMLIFrameElement {
    const iFrame = document.createElement("iframe");
    iFrame.src = uiPageFullUrl.toString();

    return iFrame;
  }

  public open(
    billableId: string | null = this.sdk.user?.user_billable_id || null,
  ) {
    if (billableId && this.shopModals.has(billableId)) {
      this.shopModals.get(billableId)?.open();
    } else {
      const shopIframeUrl = new URL("/shop", this.uiBaseUrl);
      shopIframeUrl.searchParams.set("domain", this.applicationBaseDomain);
      shopIframeUrl.searchParams.set("parentOrigin", window.location.origin);
      if (billableId) {
        shopIframeUrl.searchParams.set("billableId", billableId);
      }

      const shopIframe = this.createIFrame(shopIframeUrl);

      const shopModal = new Modal(shopIframe);

      window.addEventListener("message", async (e: MessageEvent) => {
        if (e.source !== shopIframe.contentWindow) {
          return;
        }

        if (e.data === "reload") {
          console.info("Forcing reload on Saascannon IFrames");
          shopIframe.src = shopIframeUrl.toString();
          return;
        }

        const { method, payload, callbackId } = JSON.parse(e.data);

        try {
          if (method === "getAccessToken") {
            const accessToken = await this.sdk.getAccessToken();
            e.source?.postMessage(
              JSON.stringify({
                method: "getAccessToken",
                payload: accessToken,
                callbackId,
              }),
              this.uiBaseUrl,
            );
          } else if (method === "closeModal") {
            shopModal.close();
            e.source?.postMessage(
              JSON.stringify({
                method: "closeModal",
                callbackId,
              }),
              this.uiBaseUrl,
            );
          } else if (method === "getUser") {
            e.source?.postMessage(
              JSON.stringify({
                method: "getUser",
                callbackId,
                payload: this.sdk.user,
              }),
              this.uiBaseUrl,
            );
          } else if (
            method === "accountManagementApi" &&
            this.sdk.accountManagement.api.hasOwnProperty(payload.resource) &&
            payload.method in
              this.sdk.accountManagement.api[
                payload.resource as keyof typeof this.sdk.accountManagement.api
              ]
          ) {
            const apiResource =
              this.sdk.accountManagement.api[
                payload.resource as keyof typeof this.sdk.accountManagement.api
              ];

            // @ts-expect-errork
            const result = await apiResource[
              payload.method as keyof typeof apiResource
            ](...(Array.isArray(payload.args) ? payload.args : []));

            e.source?.postMessage(
              JSON.stringify({
                method: "accountManagementApi",
                callbackId,
                payload: result,
              }),
              this.uiBaseUrl,
            );
          }
        } catch (err) {
          if (err instanceof AccountManagementApiError) {
            e.source?.postMessage(
              JSON.stringify({
                method,
                callbackId,
                error: err.body.message,
              }),
              this.uiBaseUrl,
            );
            return;
          }
          console.error(e);
        }
      });
      if (billableId) {
        this.shopModals.set(billableId, shopModal);
      }
      shopModal.open();
    }
  }

  public close(billableId: string) {
    this.shopModals.get(billableId)?.close();
  }
}

export default ShopManager;
