import express from "express";

import {
  listProducts,
  getProduct,
} from "../services/pod/printful.js";


const router = express.Router();


router.get(
  "/products",
  async (req, res) => {

    try {

      const data =
        await listProducts();

      res.json(data);

    } catch (error) {

      console.error(
        "Printful products error:",
        error
      );

      res.status(500).json({

        success: false,

        error:
          error.message ||
          "Failed to retrieve Printful products",

      });

    }

  }
);


router.get(
  "/products/:id",
  async (req, res) => {

    try {

      const data =
        await getProduct(
          req.params.id
        );

      res.json(data);

    } catch (error) {

      console.error(
        "Printful product error:",
        error
      );

      res.status(500).json({

        success: false,

        error:
          error.message ||
          "Failed to retrieve Printful product",

      });

    }

  }
);


export default router;
