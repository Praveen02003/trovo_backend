import express from "express";
import mysql from "mysql2";
import cors from "cors";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import multer from "multer";


const app = express();

app.use(express.json()); // important
app.use(cors());

const db = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "",
    database: "trovo"
});

db.connect((err) => {
    if (err) {
        console.log("Database connection failed", err);
    } else {
        console.log("MySQL Connected");
    }
});


var secretkey = '1234567890';

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, "images/");
    },
    filename: function (req, file, cb) {
        cb(null, file.originalname);
    }
});

const upload = multer({ storage: storage });
app.use("/images", express.static("images"));



const verifyToken = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.send({ message: "No token provided" });
    }

    const token = authHeader.split(" ")[1];

    jwt.verify(token, secretkey, (err, decoded) => {
        if (err) {
            return res.send({ message: "Invalid token" });
        }
        console.log(decoded, "====>");

        req.user = decoded; // ✅ id & email
        next();
    });
};


app.get("/", (req, res) => {
    res.send("Server Running");
});

app.post("/createuser", async (req, res) => {

    const { data } = req.body;

    // console.log(data);
    const getdata = "SELECT * from users where email = ?"
    db.query(getdata, [data.mail], async (err, result) => {
        if (err) {
            return res.send({
                message: "database error"
            })
        }
        else {
            const hashedPassword = await bcrypt.hash(data.password, 10);

            if (result.length > 0) {
                return res.send({
                    message: "email already exists"
                })
            }
            else {
                const sql = "INSERT INTO users (name, email, password, mobilenumber , address ,profileimage ) VALUES (?,?,?,?,?,?)";
                db.query(sql, [data.name, data.mail, hashedPassword, data.mobile, data.address, null], async (err, result) => {
                    if (err) {
                        return res.send({
                            "message": "Error inserting user"
                        });
                    } else {
                        return res.send({
                            message: "User created successfully"
                        });
                    }
                }
                );
            }
        }
    })
});

app.post("/verifyuser", async (req, res) => {

    const { data } = req.body;

    // console.log(data);
    const getdata = "SELECT * from users where email = ?"
    db.query(getdata, [data.mail], async (err, result) => {
        if (err) {
            return res.send({
                message: "database error"
            })
        }
        else {
            if (result.length > 0) {
                var password = result[0]['password'];
                var finalresult = await bcrypt.compare(data.password, password);
                if (finalresult) {
                    var id = result[0]['id'];
                    var mail = result[0]['email'];
                    const token = jwt.sign(
                        { id: id, email: mail },
                        secretkey,
                        { expiresIn: "1d" }
                    );
                    console.log(token);

                    return res.send({
                        token: token,
                        data: result[0],
                        message: "Login Successfull"
                    })
                }
                else {
                    return res.send({
                        message: "Invalid Password"
                    })
                }
            }
            else {
                return res.send({
                    message: "Invalid Credentials"
                })
            }
        }
    })
});

app.post("/updatepassword", verifyToken, async (req, res) => {
    const { data } = req.body;

    const getdata = "SELECT * FROM users WHERE email = ?";

    db.query(getdata, [data.mail], async (err, result) => {
        if (err) {
            return res.send({ message: "Database error" });
        }

        if (result.length === 0) {
            return res.send({ message: "Invalid Credentials" });
        }

        try {
            const hashedPassword = await bcrypt.hash(data.password, 10);
            const updatequery = "UPDATE users SET password = ? WHERE email = ?";

            db.query(updatequery, [hashedPassword, data.mail], (err, updateresult) => {
                if (err) {
                    return res.send({ message: "Error updating password" });
                }

                return res.send({ message: "Password updated successfully" });
            });
        } catch (hashError) {
            return res.send({ message: "Error hashing password" });
        }
    });
});



// Admin routes

app.get("/getallproducts", (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = 5;
    const category = req.query.category || "all";
    const search = req.query.search || "";
    const offset = (page - 1) * limit;

    const searchVal = `%${search}%`;

    // 1. Start with the base query
    let sql = `
        SELECT products.*, brands.brand_name, categories.category_name 
        FROM products
        INNER JOIN brands ON products.brand_id = brands.brand_id
        INNER JOIN categories ON products.category_id = categories.category_id
        WHERE (products.product_name LIKE ? OR products.product_id LIKE ?)
    `;

    let queryParams = [searchVal, searchVal];

    // 2. Add Category Filter only if it's not "all"
    if (category !== "all" && category !== "Select Category") {
        sql += ` AND products.category_id = ?`;
        queryParams.push(category);
    }

    // 3. Add Pagination
    sql += ` LIMIT ? OFFSET ?`;
    queryParams.push(limit, offset);

    db.query(sql, queryParams, (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).send({ message: "Database error" });
        }

        if (result.length === 0) {
            return res.send({ message: "No Products Available", data: [] });
        }

        res.send({
            message: "Success",
            data: result
        });
    });
});


app.get("/getallcategories", async (req, res) => {
    const getdata = "SELECT * FROM categories";

    db.query(getdata, async (err, result) => {
        if (err) {
            return res.send({ message: "Database error" });
        }

        if (result.length === 0) {
            return res.send({ message: "No Categories Available" });
        }

        try {
            // console.log(result);
            return res.send({
                message: "Success",
                data: result
            });

        } catch (hashError) {
            return res.send({ message: "Error Fetching Categories" });
        }
    });
});

app.get("/getallbrands", async (req, res) => {
    const getdata = "SELECT * FROM brands";

    db.query(getdata, async (err, result) => {
        if (err) {
            return res.send({ message: "Database error" });
        }

        if (result.length === 0) {
            return res.send({ message: "No Brands Available" });
        }

        try {
            // console.log(result);
            return res.send({
                message: "Success",
                data: result
            });

        } catch (hashError) {
            return res.send({ message: "Error Fetching Brands" });
        }
    });
});

app.get("/deleteproduct/:id", async (req, res) => {
    const id = req.params.id

    const getdata = `
    DELETE FROM products WHERE product_id = ?`;

    db.query(getdata, [id], async (err, result) => {
        if (err) {
            return res.send({ message: "Database error" });
        }
        return res.send({ message: "Product Deleted Successfully" });
    });
});

app.get("/getcurrentproduct/:id", async (req, res) => {
    const id = req.params.id
    console.log(id);

    const getdata = `
    SELECT * FROM products 
    INNER JOIN brands ON products.brand_id = brands.brand_id
    INNER JOIN categories ON products.category_id = categories.category_id 
    WHERE product_id = ?`;

    db.query(getdata, [id], async (err, result) => {
        if (err) {
            return res.send({ message: "Database error" });
        }

        if (result.length === 0) {
            return res.send({ message: "No Product Found" });
        }

        try {
            // console.log(result[0]);
            return res.send({
                message: "Success",
                data: result[0]
            });

        } catch (hashError) {
            return res.send({ message: "Error Fetching Product" });
        }
    });
});


app.post("/createproduct", upload.single("image"), (req, res) => {

    const {
        name,
        description,
        original_price,
        price,
        offer,
        stock,
        category_id,
        brand_id,
        status
    } = req.body;
    console.log(category_id);
    console.log(brand_id);


    const image = req.file.filename;

    const sql = `
        INSERT INTO products
        (product_name, description, original_price, price, offer, stock, image, category_id, brand_id, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

    db.query(
        sql,
        [
            name,
            description,
            original_price,
            price,
            offer,
            stock,
            image,
            category_id,
            brand_id,
            status
        ],
        (err, result) => {

            if (err) {
                return res.json({ message: "Product Name Already Exists" });
            }

            res.json({ message: "Product Created Successfully" });

        }
    );
});

app.post("/updateproduct", upload.single("newimage"), (req, res) => {
    const {
        product_id,
        name,
        description,
        original_price,
        price,
        offer,
        stock,
        category_id,
        brand_id,
        status,
        image
    } = req.body;

    // FIX: If req.file is present, use the NEW filename. 
    // Otherwise, keep the EXISTING 'image' filename sent from req.body.
    const finalImage = req.file ? req.file.filename : image;

    // Debugging: This will tell you if a file actually reached the server
    console.log("File received:", req.file);
    console.log("Final Image Path:", finalImage);

    const sql = `UPDATE products SET product_name=?, description=?, original_price=?, price=?, offer=?, stock=?, image=?, category_id=?, brand_id=?, status=? WHERE product_id=?`;

    db.query(sql, [name, description, original_price, price, offer, stock, finalImage, category_id, brand_id, status, product_id], (err, result) => {
        if (err) {
            console.error("SQL Error:", err);
            return res.json({ message: "Error updating product" });
        }
        if (result.affectedRows === 0) return res.json({ message: "Product not found" });
        res.json({ message: "Product Updated Successfully" });
    });
});

app.get("/getallcustomers", (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = 5;
    const status = req.query.status || "all";
    const search = req.query.search || "";
    const offset = (page - 1) * limit;

    const searchVal = `%${search}%`;

    let sql = "SELECT * FROM users WHERE (name LIKE ? OR email LIKE ?)";
    let countSql = "SELECT COUNT(*) as total FROM users WHERE (name LIKE ? OR email LIKE ?)";
    const params = [searchVal, searchVal];

    if (status !== "all") {
        sql += " AND status = ?";
        countSql += " AND status = ?";
        params.push(status);
    }

    // First, get total count
    db.query(countSql, params, (err, countResult) => {
        if (err) return res.status(500).json({ message: "Database Error" });

        const totalPages = Math.ceil(countResult[0].total / limit);

        // Get paginated data
        db.query(sql + " LIMIT ? OFFSET ?", [...params, limit, offset], (err, data) => {
            if (err) return res.status(500).json({ message: "Database Error" });

            res.json({
                message: "Success",
                data,
                totalPages,
                currentPage: page
            });
        });
    });
});

app.get("/vieweachcustomer/:id", (req, res) => {
    const id = req.params.id
    console.log(id);

    const getdata = `
    SELECT * FROM users 
    WHERE user_id = ?`;

    db.query(getdata, [id], async (err, result) => {
        if (err) {
            return res.send({ message: "Database error" });
        }

        if (result.length === 0) {
            return res.send({ message: "No User Found" });
        }

        try {
            // console.log(result[0]);
            return res.send({
                message: "Success",
                data: result[0]
            });

        } catch (hashError) {
            return res.send({ message: "Error Fetching Customer" });
        }
    });
});

app.get("/blockcustomer/:id", async (req, res) => {
    const id = req.params.id;

    const getdetails = 'SELECT * FROM users WHERE user_id = ?';
    db.query(getdetails, [id], async (err, result) => {
        if (err) {
            console.log(err);

            return res.send({ message: "Database error" });
        }
        if (result[0].status === 'active') {
            const updatedata = `
                UPDATE users SET status = ? WHERE user_id = ?`;

            db.query(updatedata, ['blocked', id], async (err, result) => {
                if (err) {
                    console.log(err);
                    return res.send({ message: "Database error" });
                }
                return res.send({ message: "User Blocked Successfully" });
            });
        }
        else {
            const updatedata = `
                UPDATE users SET status = ? WHERE user_id = ?`;

            db.query(updatedata, ['active', id], async (err, result) => {
                if (err) {
                    console.log(err);
                    return res.send({ message: "Database error" });
                }
                return res.send({ message: "User UnBlocked Successfully" });
            });
        }

    });
});


app.get("/getuserprofile/:id", async (req, res) => {
    const id = req.params.id

    const getdata = `
    SELECT * FROM users WHERE user_id = ?`;

    db.query(getdata, [id], async (err, result) => {
        if (err) {
            return res.send({ message: "Database error" });
        }

        if (result.length === 0) {
            return res.send({ message: "No User Found" });
        }

        try {
            return res.send({
                message: "Success",
                data: result[0]
            });

        } catch (hashError) {
            return res.send({ message: "Error Fetching User" });
        }
    });
});




app.listen(5000, () => {
    console.log(`Server running on http://localhost:5000`);
});